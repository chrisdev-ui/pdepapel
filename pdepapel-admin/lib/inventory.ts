import { Prisma, PrismaClient } from "@prisma/client";
import { ErrorFactory } from "./api-errors";
import {
  MANUAL_ADJUSTMENT_OPTIONS,
  MOVEMENT_TYPE_LABELS,
  type MovementType,
} from "./inventory-constants";
import { queueMarketplaceStockSyncEvents } from "./mercadolibre/outbox";

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
          component: { select: { stock: true } },
        },
      },
    },
  });

  for (const kit of kits) {
    // If no components, stock is 0 (or manually managed? Plan said determined by components)
    if (kit.kitComponents.length === 0) {
      // Option: Do nothing, or set to 0. Let's set to 0 to be safe.
      await tx.product.update({
        where: { id: kit.id },
        data: { stock: 0 },
      });
      continue;
    }

    // Calculate max available kits based on components
    // Example: Copmonent A (Stock 10, Qty 2) -> 10/2 = 5 kits.
    //          Component B (Stock 3, Qty 1) -> 3/1 = 3 kits.
    //          Max Kits = 3 (Min of results)

    let maxKits = Number.MAX_SAFE_INTEGER;

    for (const item of kit.kitComponents) {
      const componentStock = item.component.stock;
      const requiredQty = item.quantity;

      if (requiredQty <= 0) continue; // Should not happen, but avoid division by zero

      const possible = Math.floor(componentStock / requiredQty);
      if (possible < maxKits) {
        maxKits = possible;
      }
    }

    // Safety check if maxKits wasn't touched (e.g. all qty 0)
    if (maxKits === Number.MAX_SAFE_INTEGER) maxKits = 0;
    // Don't allow negative
    if (maxKits < 0) maxKits = 0;

    await tx.product.update({
      where: { id: kit.id },
      data: { stock: maxKits },
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

export async function validateStockAvailability(
  tx: PrismaTx,
  items: { productId: string; quantity: number }[],
) {
  if (items.length === 0) return;

  const physical = await resolvePhysicalRequirements(tx, items);
  if (physical.size === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: Array.from(physical.keys()) } },
    select: { id: true, stock: true, name: true },
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
    if (product.stock < requested) {
      missing.push({
        productId: product.id,
        productName: product.name,
        available: product.stock,
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
}

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

  // Pre-fetch names for reporting
  const productIds = Array.from(new Set(movements.map((m) => m.productId)));
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, stock: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Process sequentially to isolate failures
  for (const movement of movements) {
    const product = productMap.get(movement.productId);
    if (!product) {
      results.failed.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: "Desconocido",
        reason: "Producto no encontrado",
      });
      continue;
    }

    try {
      // Validate individual item if it's a decrement
      if (movement.quantity < 0) {
        // We check against the LATEST known state in DB?
        // Or since we are inside a transaction, we accept we verify against snapshot?
        // Let's re-verify strict availability to be safe (small penalty for safety)
        if (product.stock < Math.abs(movement.quantity)) {
          throw new Error(`Stock insuficiente. Disponible: ${product.stock}`);
        }
      }

      // Create movement individually (re-using single function which does atomic update)
      // Note: This calls findUniqueOrThrow inside, which is 1 extra read per item.
      // But for "Resilient" (partial failure), we accept this cost for safety.
      // Optimization: we could rewrite logic here to avoid re-read, but let's trust createInventoryMovement
      // which now uses ATOMIC updates.
      await createInventoryMovement(tx, movement);

      results.success.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: product.name,
      });

      // Update our local map in case we have multiple Ops for same product in this batch
      product.stock += movement.quantity;
    } catch (error: any) {
      results.failed.push({
        productId: movement.productId,
        quantity: movement.quantity,
        productName: product.name,
        reason: error.message || "Error desconocido",
      });
    }
  }

  // Reactive: recalculate kit stock for any affected parent kits
  if (results.success.length > 0) {
    const successIds = results.success.map((s) => s.productId);
    const parentKits = await tx.productKit.findMany({
      where: { componentId: { in: successIds } },
      select: { kitId: true },
    });
    if (parentKits.length > 0) {
      const kitIds = Array.from(new Set(parentKits.map((p) => p.kitId)));
      await recalculateKitStock(tx, kitIds);
    }
  }

  return results;
}
