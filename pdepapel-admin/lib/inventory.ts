import { Prisma, PrismaClient, StockReservationStatus } from "@prisma/client";
import { ErrorFactory } from "./api-errors";
import { availableStock, kitAvailableFromComponents, kitPhysicalFromComponents } from "./available-stock";
import {
  MANUAL_ADJUSTMENT_OPTIONS,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "./inventory-constants";
import { queueMarketplaceStockSyncEvents } from "./mercadolibre/outbox";
import { closeReservationsForOrders } from "./reservation-counters";
import { flagUnbackedReservations } from "./stock-review";

export {
  MANUAL_ADJUSTMENT_OPTIONS,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "./inventory-constants";

// Define a type that can be a transaction client or the main client
type PrismaTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export interface CreateInventoryMovementParams {
  productId: string;
  storeId: string;
  type: MovementType;
  quantity: number; // Positive = Add to stock, Negative = Remove from stock
  reason?: string;
  description?: string;
  referenceId?: string;
  cost?: number; // Unit cost at the time of movement
  price?: number; // Unit sell price at the time of movement
  createdBy?: string; // User ID or "SYSTEM"
}

export async function createInventoryMovement(
  tx: PrismaTx,
  data: CreateInventoryMovementParams,
) {
  const {
    productId,
    storeId,
    type,
    quantity,
    reason,
    description,
    referenceId,
    cost,
    price,
    createdBy,
  } = data;

  await consumeOrderReservations(tx, [data]);
  const product = await tx.product.findFirst({
    where: { id: productId, storeId },
    select: { stock: true, name: true },
  });
  if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

  const previousStock = product.stock;
  const newStock = previousStock + quantity;

  if (quantity !== 0) {
    const update = await tx.product.updateMany({
      where: {
        id: productId,
        storeId,
        ...(quantity < 0 ? { stock: { gte: Math.abs(quantity) } } : {}),
      },
      data: {
        stock: {
          [quantity > 0 ? "increment" : "decrement"]: Math.abs(quantity),
        },
      },
    });
    if (update.count !== 1) {
      if (quantity < 0) {
        throw ErrorFactory.InsufficientStock(
          product.name,
          previousStock,
          Math.abs(quantity),
        );
      }
      throw ErrorFactory.NotFound("Producto no encontrado");
    }
  }

  const movement = await tx.inventoryMovement.create({
    data: {
      storeId,
      productId,
      type,
      quantity,
      previousStock,
      newStock,
      reason,
      description,
      referenceId,
      cost,
      price,
      createdBy,
    },
  });

  const parentKits = await tx.productKit.findMany({
    where: { componentId: productId },
    select: { kitId: true },
  });

  if (parentKits.length > 0) {
    const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
    await recalculateKitStock(tx, kitIds);
    await queueMarketplaceStockSyncEvents(tx, [productId, ...kitIds]);
  } else {
    await queueMarketplaceStockSyncEvents(tx, [productId]);
  }
  if (quantity < 0) await flagUnbackedReservations(tx, [productId]);

  return movement;
}

// -- KIT LOGIC --

export async function recalculateKitStock(tx: PrismaTx, kitIds: string[]) {
  if (kitIds.length === 0) return;

  const kits = await tx.product.findMany({
    where: { id: { in: kitIds }, isKit: true },
    include: {
      kitComponents: {
        include: {
          component: { select: { stock: true, reservedUnits: true } },
        },
      },
    },
  });

  for (const kit of kits) {
    // `stock` del kit = kits que salen de las piezas físicas; `reservedUnits`
    // = los que no se pueden vender porque alguna pieza está apartada. Así
    // `availableStock(kit)` da lo mismo que armar el kit con lo disponible.
    const physical = kitPhysicalFromComponents(kit.kitComponents);
    const sellable = Math.min(physical, kitAvailableFromComponents(kit.kitComponents));
    await tx.product.update({
      where: { id: kit.id },
      data: { stock: physical, reservedUnits: physical - sellable },
    });
  }
}

/**
 * Un kit no tiene stock propio: `recalculateKitStock` lo deriva de sus
 * componentes y sobreescribe la columna sin pedir permiso. Cualquier ajuste
 * manual sobre un kit es por lo tanto un numero fantasma que la tienda muestra
 * hasta que el siguiente movimiento de un componente lo borra, sin dejar un
 * movimiento compensatorio: el libro deja de cuadrar con la columna.
 *
 * Los ajustes manuales se hacen sobre los componentes.
 */
export async function assertNotKitProducts(
  tx: PrismaTx,
  productIds: string[],
): Promise<void> {
  const ids = Array.from(new Set(productIds.filter(Boolean)));
  if (ids.length === 0) return;

  const kits = await tx.product.findMany({
    where: { id: { in: ids }, isKit: true },
    select: { id: true, name: true },
  });
  if (kits.length === 0) return;

  const names = kits.map((kit) => kit.name).join(", ");
  throw ErrorFactory.InvalidRequest(
    kits.length === 1
      ? `"${names}" es un kit: su stock se calcula a partir de sus componentes y no admite ajustes manuales. Ajusta los componentes.`
      : `Estos productos son kits y su stock se calcula a partir de sus componentes, no admiten ajustes manuales: ${names}. Ajusta los componentes.`,
  );
}

const MAX_KIT_DEPTH = 5;

/**
 * Convierte una lista de requerimientos (que puede incluir kits) en la demanda
 * fisica real por producto. Un kit no guarda stock propio: lo que hace falta
 * son sus componentes.
 *
 * La demanda de un mismo componente se SUMA venga de donde venga -- pedida
 * directamente, o a traves de uno o varios kits -- porque el stock que la
 * respalda es uno solo. Validar cada origen por separado deja pasar un carrito
 * que pide 10 unidades sueltas de A mas un kit que tambien lleva A teniendo
 * solo 10 en bodega. Es la misma regla que aplica el punto de venta
 * (`lib/point-of-sale.ts › mergePhysicalRequirement`).
 */
export async function resolvePhysicalRequirements(
  tx: PrismaTx,
  items: { productId: string; quantity: number }[],
): Promise<Map<string, number>> {
  const physical = new Map<string, number>();
  let pending = items;
  let depth = 0;

  while (pending.length > 0) {
    if (depth++ > MAX_KIT_DEPTH) {
      throw ErrorFactory.InvalidRequest(
        "La composicion de este kit es demasiado profunda o tiene una referencia circular",
      );
    }

    const grouped = new Map<string, number>();
    for (const item of pending) {
      grouped.set(
        item.productId,
        (grouped.get(item.productId) ?? 0) + item.quantity,
      );
    }

    const products = await tx.product.findMany({
      where: { id: { in: Array.from(grouped.keys()) } },
      select: {
        id: true,
        isKit: true,
        kitComponents: { select: { componentId: true, quantity: true } },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const next: { productId: string; quantity: number }[] = [];
    for (const [productId, quantity] of Array.from(grouped.entries())) {
      const product = productMap.get(productId);
      if (!product) {
        throw ErrorFactory.NotFound(`Producto no encontrado: ${productId}`);
      }
      // Solo los requerimientos positivos consumen stock.
      if (quantity <= 0) continue;

      if (!product.isKit) {
        physical.set(productId, (physical.get(productId) ?? 0) + quantity);
        continue;
      }

      for (const component of product.kitComponents ?? []) {
        next.push({
          productId: component.componentId,
          quantity: component.quantity * quantity,
        });
      }
    }

    pending = next;
  }

  return physical;
}

/**
 * Expande lineas de venta que pueden ser kits en las lineas FISICAS que de
 * verdad mueven stock: un kit desaparece de la lista y lo reemplazan sus
 * componentes, un producto normal pasa igual.
 *
 * Se usa en las rutas que descuentan stock con `updateMany` directo (Mercado
 * Libre) en vez de pasar por `createInventoryMovement`. Las rutas de pedidos
 * usan `explodeKitMovements`, que conserva ademas la linea del propio kit
 * porque alli `recalculateKitStock` corrige la columna despues.
 */
export async function explodeSaleLines<
  T extends { productId: string; quantity: number },
>(
  tx: PrismaTx,
  lines: T[],
): Promise<
  (T & {
    physicalProductId: string;
    physicalQuantity: number;
    kitId: string | null;
    kitName: string | null;
  })[]
> {
  if (lines.length === 0) return [];

  type Exploded = T & {
    physicalProductId: string;
    physicalQuantity: number;
    kitId: string | null;
    kitName: string | null;
  };

  const resolved: Exploded[] = [];
  let pending: Exploded[] = lines.map((line) => ({
    ...line,
    physicalProductId: line.productId,
    physicalQuantity: line.quantity,
    kitId: null,
    kitName: null,
  }));
  let depth = 0;

  while (pending.length > 0) {
    if (depth++ > MAX_KIT_DEPTH) {
      throw ErrorFactory.InvalidRequest(
        "La composicion de este kit es demasiado profunda o tiene una referencia circular",
      );
    }

    const ids = Array.from(new Set(pending.map((l) => l.physicalProductId)));
    const kits = await tx.product.findMany({
      where: { id: { in: ids }, isKit: true },
      select: {
        id: true,
        name: true,
        kitComponents: { select: { componentId: true, quantity: true } },
      },
    });

    if (kits.length === 0) {
      resolved.push(...pending);
      break;
    }

    const kitById = new Map(kits.map((kit) => [kit.id, kit]));
    const next: Exploded[] = [];

    for (const line of pending) {
      const kit = kitById.get(line.physicalProductId);
      if (!kit) {
        resolved.push(line);
        continue;
      }
      for (const component of kit.kitComponents ?? []) {
        next.push({
          ...line,
          physicalProductId: component.componentId,
          physicalQuantity: line.physicalQuantity * component.quantity,
          kitId: kit.id,
          kitName: kit.name,
        });
      }
    }

    pending = next;
  }

  return resolved;
}

/**
 * `forOrderIds`: pedidos que se van a pagar. Lo que sus propias reservas
 * convertidas guardan cuenta como suyo (la venta las consume), así que no se
 * resta de lo disponible para ellos.
 */
export async function validateStockAvailability(
  tx: PrismaTx,
  items: { productId: string; quantity: number }[],
  forOrderIds: string[] = [],
) {
  if (items.length === 0) return;

  const physical = await resolvePhysicalRequirements(tx, items);
  if (physical.size === 0) return;
  const ownHolds = await piecesHeldForOrders(tx, forOrderIds);

  const products = await tx.product.findMany({
    where: { id: { in: Array.from(physical.keys()) } },
    select: { id: true, stock: true, reservedUnits: true, name: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const missing: {
    productId: string;
    productName: string;
    available: number;
    requested: number;
  }[] = [];

  for (const [productId, requested] of Array.from(physical.entries())) {
    const product = productMap.get(productId);
    if (!product) {
      throw ErrorFactory.NotFound(`Producto no encontrado: ${productId}`);
    }
    const ownHeld = ownHolds.get(productId) ?? 0;
    const available = availableStock(product) + (ownHeld > 0 ? Math.min(ownHeld, product.reservedUnits ?? 0) : 0);
    if (available < requested) {
      missing.push({
        productId: product.id,
        productName: product.name,
        available,
        requested,
      });
    }
  }

  if (missing.length > 0) {
    // Always use MultipleInsufficientStock to provide consistent error structure (array of items)
    // This allows the frontend to generically handle "details.items" for highlighting.
    throw ErrorFactory.MultipleInsufficientStock(missing);
  }
}

export async function createInventoryMovementBatch(
  tx: PrismaTx,
  movements: CreateInventoryMovementParams[],
  validate: boolean = true,
) {
  await consumeOrderReservations(tx, movements);
  if (movements.length === 0) return;

  // 1. Validate total requirements if needed (only for decrements)
  if (validate) {
    const decrements = movements
      .filter((m) => m.quantity < 0)
      .map((m) => ({
        productId: m.productId,
        quantity: Math.abs(m.quantity),
      }));

    await validateStockAvailability(tx, decrements);
  }

  // 2. Pre-fetch all product details in one go to avoid N+1 reads in loop
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stock: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  // 3. Prepare creates and updates
  // NOTE: We cannot use createMany easily because each movement has different data (previousStock)
  // But we can optimize by calculating snapshots in memory from our pre-fetch.

  // To maintain correct "previousStock" in the log for sequential items of the SAME product in this batch,
  // we need to track the running stock.
  const runningStockMap = new Map(
    products.map((product) => [product.id, product.stock]),
  );

  for (const movement of movements) {
    const product = productMap.get(movement.productId);
    const currentStock = runningStockMap.get(movement.productId);
    if (!product || currentStock === undefined) {
      throw ErrorFactory.NotFound("Producto no encontrado");
    }
    const nextStock = currentStock + movement.quantity;

    if (movement.quantity !== 0) {
      const update = await tx.product.updateMany({
        where: {
          id: movement.productId,
          storeId: movement.storeId,
          ...(movement.quantity < 0
            ? { stock: { gte: Math.abs(movement.quantity) } }
            : {}),
        },
        data: {
          stock: {
            [movement.quantity > 0 ? "increment" : "decrement"]: Math.abs(
              movement.quantity,
            ),
          },
        },
      });
      if (update.count !== 1) {
        if (movement.quantity < 0) {
          throw ErrorFactory.InsufficientStock(
            product.name,
            currentStock,
            Math.abs(movement.quantity),
          );
        }
        throw ErrorFactory.NotFound("Producto no encontrado");
      }
    }

    await tx.inventoryMovement.create({
      data: {
        storeId: movement.storeId,
        productId: movement.productId,
        type: movement.type,
        quantity: movement.quantity,
        previousStock: currentStock,
        newStock: nextStock,
        reason: movement.reason,
        description: movement.description,
        referenceId: movement.referenceId,
        cost: movement.cost,
        price: movement.price,
        createdBy: movement.createdBy,
      },
    });

    runningStockMap.set(movement.productId, nextStock);
  }

  // Reactive: recalculate kit stock for any affected parent kits
  const allAffectedIds = Array.from(new Set(movements.map((m) => m.productId)));
  const parentKits = await tx.productKit.findMany({
    where: { componentId: { in: allAffectedIds } },
    select: { kitId: true },
  });
  if (parentKits.length > 0) {
    const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
    await recalculateKitStock(tx, kitIds);
    await queueMarketplaceStockSyncEvents(tx, [...allAffectedIds, ...kitIds]);
  } else {
    await queueMarketplaceStockSyncEvents(tx, allAffectedIds);
  }
  await flagUnbackedReservations(tx, movements.filter((m) => m.quantity < 0).map((m) => m.productId));
}

/**
 * Muchos movimientos de una vez, sin que uno malo frene a los demás.
 *
 * Antes cada movimiento repetía la ruta individual (leer el producto,
 * descontar, insertar, recalcular kits, encolar Mercado Libre): cinco viajes
 * a la base por unidad de trabajo. Al cerrar una feria de 76 filas eran
 * unos 450 viajes seguidos dentro de una transacción, y desde Vercel a
 * Railway eso pasa del minuto que tiene una función: el cierre de FERIA
 * SOLARIS se cortó a los 60 s el 2026-09-28 y la transacción se deshizo.
 *
 * Ahora se planea todo en memoria contra una sola lectura de los productos
 * y se escribe en cuatro pasos: UN `UPDATE … CASE` parametrizado por tienda
 * (acotado a esos ids y a esa tienda, con la guardia «no bajar de cero» en el
 * WHERE), UN `createMany` con los movimientos, una pasada de kits y una
 * cola de Mercado Libre. Lo resiliente sigue igual: un producto que no
 * existe, que es de otra tienda o que no tiene stock para el descuento se
 * salta y queda en `failed` con su motivo, y el resto entra.
 */
export async function createInventoryMovementBatchResilient(
  tx: PrismaTx,
  movements: CreateInventoryMovementParams[],
) {
  const results = {
    success: [] as {
      productId: string;
      quantity: number;
      productName: string;
    }[],
    failed: [] as {
      productId: string;
      quantity: number;
      productName: string;
      reason: string;
    }[],
  };
  if (movements.length === 0) return results;
  // El apartado convertido de este pedido deja de guardar antes de la venta:
  // si no, la venta chocaría con su propio apartado y lo marcaría sin respaldo.
  await consumeOrderReservations(tx, movements);

  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stock: true, storeId: true },
  });
  const productMap = new Map(products.map((p) => [p.id, { ...p }]));

  // Plan en memoria, en orden: el stock corre movimiento a movimiento para que
  // dos líneas del mismo producto lleven instantáneas consecutivas y correctas.
  type Planned = CreateInventoryMovementParams & {
    previousStock: number;
    newStock: number;
    productName: string;
  };
  const planned: Planned[] = [];
  for (const movement of movements) {
    const product = productMap.get(movement.productId);
    if (!product || product.storeId !== movement.storeId) {
      results.failed.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: product?.name ?? "Desconocido",
        reason: "Producto no encontrado",
      });
      continue;
    }
    if (movement.quantity < 0 && product.stock < Math.abs(movement.quantity)) {
      results.failed.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: product.name,
        reason: `Stock insuficiente. Disponible: ${product.stock}`,
      });
      continue;
    }
    const previousStock = product.stock;
    const newStock = previousStock + movement.quantity;
    planned.push({ ...movement, previousStock, newStock, productName: product.name });
    product.stock = newStock;
  }
  if (planned.length === 0) return results;

  // Un UPDATE por tienda, acotado a sus ids: `stock = stock + delta` respeta lo
  // que otra venta haya movido mientras tanto, y la guardia del WHERE deja
  // fuera al producto que ya no tiene con qué descontar.
  const deltaByStore = new Map<string, Map<string, number>>();
  for (const line of planned) {
    const byProduct = deltaByStore.get(line.storeId) ?? new Map<string, number>();
    byProduct.set(line.productId, (byProduct.get(line.productId) ?? 0) + line.quantity);
    deltaByStore.set(line.storeId, byProduct);
  }
  const rejectedProductIds = new Set<string>();
  for (const [storeId, byProduct] of Array.from(deltaByStore.entries())) {
    const entries = Array.from(byProduct.entries()).filter(([, delta]) => delta !== 0);
    if (entries.length === 0) continue;
    const ids = entries.map(([id]) => id);
    const deltaCase = Prisma.sql`CASE \`id\` ${Prisma.join(
      entries.map(([id, delta]) => Prisma.sql`WHEN ${id} THEN ${delta}`),
      " ",
    )} ELSE 0 END`;
    const affected = await tx.$executeRaw`
      UPDATE \`Product\`
         SET \`stock\` = \`stock\` + ${deltaCase},
             \`updatedAt\` = NOW(3)
       WHERE \`storeId\` = ${storeId}
         AND \`id\` IN (${Prisma.join(ids)})
         AND \`stock\` + ${deltaCase} >= 0`;
    if (affected !== ids.length) {
      // Alguna fila no entró (se quedó sin stock o desapareció entre la
      // lectura y la escritura): se relee esa tienda y se separan.
      const current = await tx.product.findMany({
        where: { id: { in: ids }, storeId },
        select: { id: true, stock: true },
      });
      const stockNow = new Map(current.map((p) => [p.id, p.stock]));
      for (const [id] of entries) {
        const expected = productMap.get(id)?.stock;
        if (stockNow.get(id) !== expected) rejectedProductIds.add(id);
      }
    }
  }
  const accepted: Planned[] = [];
  for (const line of planned) {
    if (rejectedProductIds.has(line.productId)) {
      results.failed.push({
        productId: line.productId,
        quantity: line.quantity,
        productName: line.productName,
        reason:
          line.quantity < 0
            ? "Stock insuficiente. Otra operación lo descontó al mismo tiempo"
            : "Producto no encontrado",
      });
      continue;
    }
    accepted.push(line);
  }
  if (accepted.length === 0) return results;

  await tx.inventoryMovement.createMany({
    data: accepted.map((line) => ({
      storeId: line.storeId,
      productId: line.productId,
      type: line.type,
      quantity: line.quantity,
      previousStock: line.previousStock,
      newStock: line.newStock,
      reason: line.reason,
      description: line.description,
      referenceId: line.referenceId,
      cost: line.cost,
      price: line.price,
      createdBy: line.createdBy,
    })),
  });
  for (const line of accepted) {
    results.success.push({
      productId: line.productId,
      quantity: line.quantity,
      productName: line.productName,
    });
  }

  // Los kits que contienen estas piezas se recalculan una sola vez, y
  // Mercado Libre se entera una sola vez (antes, la ruta individual lo
  // encolaba movimiento a movimiento).
  const successIds = Array.from(new Set(accepted.map((line) => line.productId)));
  const parentKits = await tx.productKit.findMany({
    where: { componentId: { in: successIds } },
    select: { kitId: true },
  });
  const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
  if (kitIds.length > 0) {
    await recalculateKitStock(tx, kitIds);
  }
  await queueMarketplaceStockSyncEvents(tx, [...successIds, ...kitIds]);
  // Un pago confirmado se lleva las unidades aunque estuvieran apartadas.
  await flagUnbackedReservations(tx, accepted.filter((line) => line.quantity < 0).map((line) => line.productId));
  return results;
}

/** Las ventas de un pedido consumen el apartado que se convirtió en ese pedido. */
async function consumeOrderReservations(tx: PrismaTx, movements: CreateInventoryMovementParams[]) {
  const orderIds = movements.filter((movement) => movement.quantity < 0 && movement.referenceId).map((movement) => movement.referenceId!);
  if (orderIds.length === 0) return;
  await closeReservationsForOrders(tx, orderIds, "CONSUMED");
}

async function piecesHeldForOrders(tx: PrismaTx, orderIds: string[]): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  if (orderIds.length === 0) return held;
  const holds = await tx.stockReservation.findMany({
    where: { orderId: { in: orderIds }, status: StockReservationStatus.CONVERTED },
    select: { productId: true, quantity: true },
  });
  for (const hold of holds ?? []) {
    const pieces = await resolvePhysicalRequirements(tx, [{ productId: hold.productId, quantity: hold.quantity }]);
    pieces.forEach((units, id) => held.set(id, (held.get(id) ?? 0) + units));
  }
  return held;
}
