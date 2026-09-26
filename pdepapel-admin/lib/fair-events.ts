import {
  FairCapsuleStatus,
  FairEventStatus,
  InventoryMovementType,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Prisma,
} from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

import { movementActor } from "@/lib/movement-actor";
import { AppError, ErrorFactory } from "@/lib/api-errors";
import { isPaymentProofForStore } from "@/lib/payment-proof-key";
import {
  createInventoryMovementBatchResilient,
  recalculateKitStock,
  type CreateInventoryMovementParams,
} from "@/lib/inventory";
import { queueMarketplaceStockSyncEvents } from "@/lib/mercadolibre/outbox";
import {
  formatFairIssueReference,
  recordInventoryIssues,
} from "@/lib/order-inventory-issues";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";

type TransactionClient = Prisma.TransactionClient;

export type FairAllocationInput = {
  productId: string;
  quantity: number;
};

export type FairSaleInput = {
  productId?: string;
  quantity?: number;
  capsuleCode?: string;
};

export type FairReconciliationInput = {
  productId: string;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
};

type FairSaleLine = {
  productId: string;
  capsuleId?: string;
  quantity: number;
  name: string;
  sku: string;
  imageUrl: string;
  price: number;
  cost: number;
};

export { getFairStockAvailability } from "@/lib/fair-phases";
import { getFairStockAvailability } from "@/lib/fair-phases";

export const getCapsuleMargin = (salePrice: number, productCost: number) => {
  if (salePrice <= 0) return -Infinity;
  return ((salePrice - productCost) / salePrice) * 100;
};

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw ErrorFactory.InvalidRequest(
      `${label} debe ser un entero mayor a cero`,
    );
  }
}

function assertNonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw ErrorFactory.InvalidRequest(
      `${label} debe ser un entero igual o mayor a cero`,
    );
  }
}

function assertOperationalEvent(status: FairEventStatus) {
  if (status !== FairEventStatus.DRAFT && status !== FairEventStatus.OPEN) {
    throw ErrorFactory.Conflict(
      "La feria no está disponible para registrar inventario o ventas",
    );
  }
}

function createCapsuleCode(fairEventId: string) {
  return `CAP-${fairEventId.slice(0, 8).toUpperCase()}-${uuidv4()
    .slice(0, 8)
    .toUpperCase()}`;
}

async function refreshAffectedKits(
  tx: TransactionClient,
  productIds: string[],
) {
  const parentKits = await tx.productKit.findMany({
    where: { componentId: { in: productIds } },
    select: { kitId: true },
  });

  const kitIds = Array.from(new Set(parentKits.map((item) => item.kitId)));
  if (kitIds.length > 0) {
    await recalculateKitStock(tx as never, kitIds);
  }

  return kitIds;
}

/** Una pieza de la receta de un kit, tal como se leyó al reservar. */
type KitRecipeLine = {
  componentId: string;
  quantityPerKit: number;
  component: { id: string; name: string; price: unknown; acqPrice: unknown };
};

/**
 * La receta con la que se puede reservar un kit: las mismas reglas que el
 * Punto de venta exige para vender uno (piezas propias, activas, sin kits
 * anidados, cantidades positivas).
 */
function assertReservableKitRecipe(
  kit: {
    name: string;
    kitComponents: {
      componentId: string;
      quantity: number;
      component: {
        id: string;
        name: string;
        price: unknown;
        acqPrice: unknown;
        storeId: string;
        isArchived: boolean;
        isKit: boolean;
      };
    }[];
  },
  storeId: string,
): KitRecipeLine[] {
  if (kit.kitComponents.length === 0) {
    throw ErrorFactory.InvalidRequest(
      `El kit “${kit.name}” no tiene productos configurados`,
    );
  }
  for (const line of kit.kitComponents) {
    if (
      line.quantity <= 0 ||
      line.component.storeId !== storeId ||
      line.component.isArchived ||
      line.component.isKit
    ) {
      throw ErrorFactory.InvalidRequest(
        `El kit “${kit.name}” tiene una configuración de inventario no válida`,
      );
    }
  }
  return kit.kitComponents.map((line) => ({
    componentId: line.componentId,
    quantityPerKit: line.quantity,
    component: line.component,
  }));
}

/** ¿La receta viva es exactamente la foto que guardó la feria? */
export function kitRecipeMatchesSnapshot(
  recipe: { componentId: string; quantityPerKit: number }[],
  snapshot: { componentId: string; quantityPerKit: number }[],
): boolean {
  if (recipe.length !== snapshot.length) return false;
  const byComponent = new Map(
    snapshot.map((line) => [line.componentId, line.quantityPerKit]),
  );
  return recipe.every(
    (line) => byComponent.get(line.componentId) === line.quantityPerKit,
  );
}

/**
 * Las piezas de las recetas congeladas, leídas aparte de la relación. Con
 * `relationMode = "prisma"` un `include` sobre una pieza que ya no existe
 * hace fallar la consulta entera; leyéndolas así, una pieza desaparecida es
 * un hueco en el mapa (costo cero, incidencia al cerrar), no una feria que no
 * se puede cerrar ni abrir.
 */
async function loadKitComponentProducts(
  tx: TransactionClient | typeof prismadb,
  componentIds: string[],
) {
  const ids = Array.from(new Set(componentIds));
  if (ids.length === 0) {
    return new Map<
      string,
      { id: string; name: string; sku: string; acqPrice: unknown; price: unknown }
    >();
  }
  const products = await tx.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, sku: true, acqPrice: true, price: true },
  });
  return new Map(products.map((product) => [product.id, product]));
}

/** Costo de una unidad de kit: la suma de sus piezas, como en el Punto de venta. */
export function kitLineCost(
  lines: { quantityPerKit: number; component: { acqPrice: unknown } }[],
): number {
  return lines.reduce(
    (total, line) =>
      total + Number(line.component.acqPrice || 0) * line.quantityPerKit,
    0,
  );
}

/**
 * Descuenta `units` del stock de un producto con guardia atómica y devuelve
 * el stock previo real. Se relee justo antes porque una misma pieza puede
 * salir dos veces en la misma reserva (suelta y dentro de un kit, o en dos
 * kits): el valor de la consulta inicial ya estaría viejo para el kardex.
 */
async function takeStockForFair(
  tx: TransactionClient,
  storeId: string,
  productId: string,
  units: number,
): Promise<{ previousStock: number } | null> {
  const before = await tx.product.findFirst({
    where: { id: productId, storeId },
    select: { stock: true },
  });
  if (!before) return null;
  const update = await tx.product.updateMany({
    where: { id: productId, storeId, stock: { gte: units } },
    data: { stock: { decrement: units } },
  });
  if (update.count !== 1) return null;
  return { previousStock: before.stock };
}

/**
 * Reserva `quantity` kits para la feria: aparta cada pieza del stock en línea
 * (movimiento por componente, nunca sobre el kit), deja una sola línea de
 * feria para el kit y congela la receta. Si el kit ya estaba reservado, la
 * receta viva tiene que ser la misma foto: los kits ya armados llevan la
 * receta de entonces.
 */
async function reserveKitForFair({
  tx,
  storeId,
  fairEvent,
  kit,
  recipe,
  quantity,
  userId,
}: {
  tx: TransactionClient;
  storeId: string;
  fairEvent: { id: string; name: string };
  kit: { id: string; name: string };
  recipe: KitRecipeLine[];
  quantity: number;
  userId: string;
}) {
  const existing = await tx.fairEventInventoryItem.findUnique({
    where: {
      fairEventId_productId: { fairEventId: fairEvent.id, productId: kit.id },
    },
    include: { kitComponents: true },
  });
  if (existing && !kitRecipeMatchesSnapshot(recipe, existing.kitComponents)) {
    throw ErrorFactory.Conflict(
      `La receta de “${kit.name}” cambió desde que se reservó para esta feria. Los kits ya reservados conservan la receta de entonces; para reservar más con la receta nueva, cierra esta feria y hazlo en una nueva.`,
    );
  }

  for (const line of recipe) {
    const units = quantity * line.quantityPerKit;
    const taken = await takeStockForFair(tx, storeId, line.componentId, units);
    if (!taken) {
      const current = await tx.product.findUnique({
        where: { id: line.componentId },
        select: { stock: true },
      });
      const stock = current?.stock ?? 0;
      const possible = Math.floor(stock / line.quantityPerKit);
      throw new AppError(
        `Solo alcanza para ${possible} ${possible === 1 ? "kit" : "kits"} de “${kit.name}”: «${line.component.name}» tiene ${stock} y cada kit lleva ${line.quantityPerKit}`,
        422,
        { productId: line.componentId, available: stock, requested: units },
      );
    }
    await tx.inventoryMovement.create({
      data: {
        storeId,
        productId: line.componentId,
        type: InventoryMovementType.FESTIVAL_ALLOCATION,
        quantity: -units,
        previousStock: taken.previousStock,
        newStock: taken.previousStock - units,
        cost:
          line.component.acqPrice == null
            ? undefined
            : Number(line.component.acqPrice),
        price: Number(line.component.price || 0),
        reason: `Asignado a feria: ${fairEvent.name} · kit «${kit.name}» × ${quantity}`,
        referenceId: fairEvent.id,
        createdBy: movementActor(userId),
      },
    });
  }

  const row = await tx.fairEventInventoryItem.upsert({
    where: {
      fairEventId_productId: { fairEventId: fairEvent.id, productId: kit.id },
    },
    create: {
      fairEventId: fairEvent.id,
      productId: kit.id,
      allocatedQuantity: quantity,
    },
    update: { allocatedQuantity: { increment: quantity } },
  });
  if (!existing) {
    await tx.fairEventKitComponent.createMany({
      data: recipe.map((line) => ({
        fairEventInventoryItemId: row.id,
        componentId: line.componentId,
        quantityPerKit: line.quantityPerKit,
      })),
    });
  }
}

export async function getFairEventDetail(storeId: string, fairEventId: string) {
  const fairEvent = await prismadb.fairEvent.findFirst({
    where: { id: fairEventId, storeId },
    include: {
      inventoryItems: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              stock: true,
              price: true,
              acqPrice: true,
              gtin: true,
              isKit: true,
              images: { orderBy: { isMain: "desc" }, take: 1 },
            },
          },
          kitComponents: {
            select: { componentId: true, quantityPerKit: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { product: { name: "asc" } },
      },
      capsules: {
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { packedAt: "desc" },
      },
      orders: {
        take: 200,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          total: true,
          createdAt: true,
          payment: { select: { method: true, proofKey: true } },
          orderItems: {
            select: { id: true, name: true, quantity: true, price: true },
          },
        },
      },
    },
  });

  if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
  const components = await loadKitComponentProducts(
    prismadb,
    fairEvent.inventoryItems.flatMap((item) =>
      item.kitComponents.map((line) => line.componentId),
    ),
  );
  return {
    ...fairEvent,
    inventoryItems: fairEvent.inventoryItems.map((item) => ({
      ...item,
      kitComponents: item.kitComponents.map((line) => ({
        ...line,
        component: components.get(line.componentId) ?? {
          id: line.componentId,
          name: "Producto eliminado",
          sku: "",
          acqPrice: null,
          price: null,
        },
      })),
    })),
  };
}

export async function allocateFairInventory({
  storeId,
  fairEventId,
  allocations,
  userId,
}: {
  storeId: string;
  fairEventId: string;
  allocations: FairAllocationInput[];
  userId: string;
}) {
  const aggregatedAllocations = new Map<string, number>();

  allocations.forEach((allocation) => {
    assertPositiveInteger(allocation.quantity, "La cantidad");
    if (!allocation.productId) {
      throw ErrorFactory.InvalidRequest(
        "Cada producto debe estar seleccionado",
      );
    }
    aggregatedAllocations.set(
      allocation.productId,
      (aggregatedAllocations.get(allocation.productId) || 0) +
        allocation.quantity,
    );
  });

  if (aggregatedAllocations.size === 0) {
    throw ErrorFactory.InvalidRequest("Agrega al menos un producto a la feria");
  }

  await prismadb.$transaction(async (tx) => {
    const fairEvent = await tx.fairEvent.findFirst({
      where: { id: fairEventId, storeId },
      select: { id: true, status: true, name: true },
    });
    if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
    assertOperationalEvent(fairEvent.status);

    const productIds = Array.from(aggregatedAllocations.keys());
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, storeId, isArchived: false },
      select: {
        id: true,
        name: true,
        stock: true,
        price: true,
        acqPrice: true,
        isKit: true,
        kitComponents: {
          select: {
            componentId: true,
            quantity: true,
            component: {
              select: {
                id: true,
                name: true,
                price: true,
                acqPrice: true,
                storeId: true,
                isArchived: true,
                isKit: true,
              },
            },
          },
        },
      },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    /** Piezas cuyo stock cambió por un kit: sus kits se recalculan al final. */
    const touchedComponentIds = new Set<string>();

    for (const [productId, quantity] of Array.from(
      aggregatedAllocations.entries(),
    )) {
      const product = productsById.get(productId);
      if (!product) throw ErrorFactory.NotFound("Producto no encontrado");
      if (product.isKit) {
        const recipe = assertReservableKitRecipe(product, storeId);
        await reserveKitForFair({
          tx,
          storeId,
          fairEvent,
          kit: product,
          recipe,
          quantity,
          userId,
        });
        recipe.forEach((line) => touchedComponentIds.add(line.componentId));
        continue;
      }

      const taken = await takeStockForFair(tx, storeId, productId, quantity);
      if (!taken) {
        const current = await tx.product.findUnique({
          where: { id: productId },
          select: { stock: true },
        });
        throw ErrorFactory.InsufficientStock(
          product.name,
          current?.stock ?? product.stock,
          quantity,
        );
      }

      await tx.fairEventInventoryItem.upsert({
        where: {
          fairEventId_productId: { fairEventId, productId },
        },
        create: {
          fairEventId,
          productId,
          allocatedQuantity: quantity,
        },
        update: { allocatedQuantity: { increment: quantity } },
      });

      await tx.inventoryMovement.create({
        data: {
          storeId,
          productId,
          type: InventoryMovementType.FESTIVAL_ALLOCATION,
          quantity: -quantity,
          previousStock: taken.previousStock,
          newStock: taken.previousStock - quantity,
          cost: product.acqPrice ?? undefined,
          price: product.price,
          reason: `Asignado a feria: ${fairEvent.name}`,
          referenceId: fairEventId,
          createdBy: movementActor(userId),
        },
      });
    }

    const touched = Array.from(
      new Set([...productIds, ...Array.from(touchedComponentIds)]),
    );
    const kitIds = await refreshAffectedKits(tx, touched);
    await queueMarketplaceStockSyncEvents(
      tx,
      Array.from(new Set([...touched, ...kitIds])),
    );
  });
}

export async function openFairEvent({
  storeId,
  fairEventId,
}: {
  storeId: string;
  fairEventId: string;
}) {
  const fairEvent = await prismadb.fairEvent.findFirst({
    where: { id: fairEventId, storeId },
    include: { _count: { select: { inventoryItems: true } } },
  });
  if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
  if (fairEvent.status !== FairEventStatus.DRAFT) {
    throw ErrorFactory.Conflict(
      "Solo las ferias en preparación se pueden abrir",
    );
  }
  if (fairEvent._count.inventoryItems === 0) {
    throw ErrorFactory.InvalidRequest(
      "Asigna productos antes de abrir la feria",
    );
  }

  return prismadb.fairEvent.update({
    where: { id: fairEventId },
    data: { status: FairEventStatus.OPEN, openedAt: new Date() },
  });
}

/**
 * Vender → Conciliar. Detiene las ventas (createFairSale exige OPEN) para
 * contar con calma; se puede volver a abrir si faltaba vender.
 */
export async function startFairReconciliation({
  storeId,
  fairEventId,
}: {
  storeId: string;
  fairEventId: string;
}) {
  const fairEvent = await prismadb.fairEvent.findFirst({
    where: { id: fairEventId, storeId },
    select: { id: true, status: true },
  });
  if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
  if (fairEvent.status !== FairEventStatus.OPEN) {
    throw ErrorFactory.Conflict(
      "Solo una feria abierta puede pasar a conciliación",
    );
  }
  return prismadb.fairEvent.update({
    where: { id: fairEventId },
    data: { status: FairEventStatus.RECONCILING },
  });
}

/** Conciliar → Vender, mientras la feria no se haya cerrado. */
export async function reopenFairEvent({
  storeId,
  fairEventId,
}: {
  storeId: string;
  fairEventId: string;
}) {
  const fairEvent = await prismadb.fairEvent.findFirst({
    where: { id: fairEventId, storeId },
    select: { id: true, status: true },
  });
  if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
  if (fairEvent.status !== FairEventStatus.RECONCILING) {
    throw ErrorFactory.Conflict(
      "Solo una feria en conciliación se puede volver a abrir",
    );
  }
  return prismadb.fairEvent.update({
    where: { id: fairEventId },
    data: { status: FairEventStatus.OPEN },
  });
}

export async function packFairCapsules({
  storeId,
  fairEventId,
  productId,
  quantity,
  salePrice,
  minimumMarginPct,
}: {
  storeId: string;
  fairEventId: string;
  productId: string;
  quantity: number;
  salePrice: number;
  minimumMarginPct: number;
}) {
  assertPositiveInteger(quantity, "La cantidad de cápsulas");
  if (!Number.isFinite(salePrice) || salePrice <= 0) {
    throw ErrorFactory.InvalidRequest(
      "El precio de venta debe ser mayor a cero",
    );
  }
  if (
    !Number.isFinite(minimumMarginPct) ||
    minimumMarginPct < 0 ||
    minimumMarginPct >= 100
  ) {
    throw ErrorFactory.InvalidRequest(
      "El margen mínimo debe estar entre 0 y 99.99",
    );
  }

  return prismadb.$transaction(async (tx) => {
    const fairEvent = await tx.fairEvent.findFirst({
      where: { id: fairEventId, storeId },
      select: { id: true, status: true },
    });
    if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
    assertOperationalEvent(fairEvent.status);

    const eventItem = await tx.fairEventInventoryItem.findUnique({
      where: { fairEventId_productId: { fairEventId, productId } },
      include: { product: true },
    });
    if (!eventItem) {
      throw ErrorFactory.InvalidRequest(
        "El producto debe estar asignado a esta feria antes de empacar cápsulas",
      );
    }
    if (eventItem.product.isKit) {
      throw ErrorFactory.InvalidRequest(
        "Las cápsulas se empacan con productos físicos; un kit no se puede empacar en cápsulas",
      );
    }

    const productCost = Number(eventItem.product.acqPrice || 0);
    if (productCost <= 0) {
      throw ErrorFactory.InvalidRequest(
        `Registra el costo de “${eventItem.product.name}” antes de empacarlo en cápsulas`,
      );
    }
    const actualMargin = getCapsuleMargin(salePrice, productCost);
    if (actualMargin < minimumMarginPct) {
      throw ErrorFactory.InvalidRequest(
        `La cápsula no cumple el margen mínimo. Margen calculado: ${actualMargin.toFixed(1)}%`,
      );
    }

    const available = getFairStockAvailability(eventItem);
    if (available < quantity) {
      throw ErrorFactory.InsufficientStock(
        eventItem.product.name,
        available,
        quantity,
      );
    }

    const optimisticUpdate = await tx.fairEventInventoryItem.updateMany({
      where: {
        id: eventItem.id,
        packedQuantity: eventItem.packedQuantity,
        soldQuantity: eventItem.soldQuantity,
      },
      data: { packedQuantity: { increment: quantity } },
    });
    if (optimisticUpdate.count !== 1) {
      throw ErrorFactory.Conflict(
        "El inventario de feria cambió. Actualiza e intenta de nuevo",
      );
    }

    const capsuleData = Array.from({ length: quantity }, () => ({
      fairEventId,
      productId,
      code: createCapsuleCode(fairEventId),
      salePrice,
      productCost,
      minimumMarginPct,
    }));
    await tx.fairCapsule.createMany({ data: capsuleData });

    return tx.fairCapsule.findMany({
      where: { code: { in: capsuleData.map((capsule) => capsule.code) } },
      orderBy: { packedAt: "asc" },
      include: { product: { select: { name: true, sku: true } } },
    });
  });
}

/** Mínimo de la referencia de una transferencia: el mismo que en el Punto de venta. */
export const FAIR_TRANSFER_REFERENCE_MIN = 4;

/**
 * Referencia y comprobante de una venta de feria, validados antes de tocar
 * la base. La transferencia exige referencia (como en el Punto de venta) y
 * admite un comprobante; efectivo no lleva ninguno de los dos. El comprobante
 * tiene que ser la clave canónica de un objeto de ESTA tienda en el bucket
 * privado (lib/payment-proof-key.ts): una clave de otra tienda o inventada
 * no se guarda.
 */
export function resolveFairSalePayment({
  storeId,
  paymentMethod,
  transactionId,
  proofKey,
}: {
  storeId: string;
  paymentMethod: PaymentMethod;
  transactionId?: string | null;
  proofKey?: string | null;
}): { transactionId: string | null; proofKey: string | null } {
  if (paymentMethod !== PaymentMethod.BankTransfer) {
    return { transactionId: null, proofKey: null };
  }
  const reference = (transactionId ?? "").trim();
  if (reference.length < FAIR_TRANSFER_REFERENCE_MIN) {
    throw ErrorFactory.InvalidRequest(
      "La transferencia necesita la referencia del comprobante (mínimo cuatro caracteres)",
    );
  }
  const proof = (proofKey ?? "").trim();
  if (proof && !isPaymentProofForStore(proof, storeId)) {
    throw ErrorFactory.InvalidRequest(
      "El comprobante no es válido para esta tienda",
    );
  }
  return { transactionId: reference, proofKey: proof || null };
}

export async function createFairSale({
  storeId,
  fairEventId,
  items,
  paymentMethod,
  idempotencyKey,
  userId,
  transactionId,
  proofKey,
}: {
  storeId: string;
  fairEventId: string;
  items: FairSaleInput[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  userId: string;
  /** Referencia del comprobante; obligatoria en transferencia. */
  transactionId?: string | null;
  /** Comprobante (clave devuelta por lib/payment-proofs); solo en transferencia. */
  proofKey?: string | null;
}) {
  if (!idempotencyKey || idempotencyKey.length < 12) {
    throw ErrorFactory.InvalidRequest(
      "La venta requiere una clave de seguridad",
    );
  }
  if (!items.length) {
    throw ErrorFactory.InvalidRequest("Agrega al menos un producto a la venta");
  }
  const payment = resolveFairSalePayment({
    storeId,
    paymentMethod,
    transactionId,
    proofKey,
  });

  return prismadb.$transaction(async (tx) => {
    const existingOrder = await tx.order.findFirst({
      where: { storeId, idempotencyKey },
      include: { payment: true, orderItems: true },
    });
    if (existingOrder) return { order: existingOrder, duplicate: true };

    const fairEvent = await tx.fairEvent.findFirst({
      where: { id: fairEventId, storeId },
      include: {
        inventoryItems: {
          include: {
            product: {
              include: {
                images: { orderBy: { isMain: "desc" }, take: 1 },
              },
            },
            kitComponents: {
              select: { componentId: true, quantityPerKit: true },
            },
          },
        },
      },
    });
    if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
    if (fairEvent.status !== FairEventStatus.OPEN) {
      throw ErrorFactory.Conflict(
        "La feria debe estar abierta para registrar ventas",
      );
    }

    const directQuantities = new Map<string, number>();
    const capsuleCodes: string[] = [];
    items.forEach((item) => {
      if (item.capsuleCode) {
        capsuleCodes.push(item.capsuleCode.trim().toUpperCase());
        return;
      }
      if (!item.productId) {
        throw ErrorFactory.InvalidRequest(
          "Cada ítem debe ser un producto o cápsula",
        );
      }
      const quantity = item.quantity || 1;
      assertPositiveInteger(quantity, "La cantidad");
      directQuantities.set(
        item.productId,
        (directQuantities.get(item.productId) || 0) + quantity,
      );
    });

    if (new Set(capsuleCodes).size !== capsuleCodes.length) {
      throw ErrorFactory.InvalidRequest(
        "Una cápsula solo se puede cobrar una vez",
      );
    }

    const capsules = capsuleCodes.length
      ? await tx.fairCapsule.findMany({
          where: {
            fairEventId,
            code: { in: capsuleCodes },
            status: FairCapsuleStatus.PACKED,
          },
          include: {
            product: {
              include: {
                images: { orderBy: { isMain: "desc" }, take: 1 },
              },
            },
          },
        })
      : [];
    if (capsules.length !== capsuleCodes.length) {
      throw ErrorFactory.Conflict(
        "Una o más cápsulas no están disponibles para esta venta",
      );
    }

    const eventItemsByProduct = new Map(
      fairEvent.inventoryItems.map((item) => [item.productId, item]),
    );
    const kitComponentProducts = await loadKitComponentProducts(
      tx,
      fairEvent.inventoryItems.flatMap((item) =>
        (item.kitComponents ?? []).map((line) => line.componentId),
      ),
    );
    const saleQuantities = new Map<
      string,
      { direct: number; capsules: number }
    >();
    directQuantities.forEach((quantity, productId) => {
      saleQuantities.set(productId, { direct: quantity, capsules: 0 });
    });
    capsules.forEach((capsule) => {
      const current = saleQuantities.get(capsule.productId) || {
        direct: 0,
        capsules: 0,
      };
      current.capsules += 1;
      saleQuantities.set(capsule.productId, current);
    });

    for (const [productId, quantities] of Array.from(
      saleQuantities.entries(),
    )) {
      const eventItem = eventItemsByProduct.get(productId);
      if (!eventItem) {
        throw ErrorFactory.InvalidRequest(
          "Todos los productos vendidos deben pertenecer al inventario de la feria",
        );
      }
      const availableForDirectSales = getFairStockAvailability(eventItem);
      if (quantities.direct > availableForDirectSales) {
        throw ErrorFactory.InsufficientStock(
          eventItem.product.name,
          availableForDirectSales,
          quantities.direct,
        );
      }
    }

    const directLines: FairSaleLine[] = Array.from(
      directQuantities,
      ([productId, quantity]) => {
        const eventItem = eventItemsByProduct.get(productId)!;
        return {
          productId,
          quantity,
          name: eventItem.product.name,
          sku: eventItem.product.sku,
          imageUrl: eventItem.product.images[0]?.url || "",
          price: Number(eventItem.product.price),
          // Un kit no tiene costo propio: vale lo que valen sus piezas.
          cost: eventItem.product.isKit
            ? kitLineCost(
                (eventItem.kitComponents ?? []).map((line) => ({
                  quantityPerKit: line.quantityPerKit,
                  component: kitComponentProducts.get(line.componentId) ?? {
                    acqPrice: null,
                  },
                })),
              )
            : Number(eventItem.product.acqPrice || 0),
        };
      },
    );
    const capsuleLines: FairSaleLine[] = capsules.map((capsule) => ({
      productId: capsule.productId,
      capsuleId: capsule.id,
      quantity: 1,
      name: "Cápsula sorpresa",
      sku: capsule.code,
      imageUrl: capsule.product.images[0]?.url || "",
      price: capsule.salePrice,
      cost: capsule.productCost,
    }));
    const saleLines: FairSaleLine[] = [...directLines, ...capsuleLines];
    const subtotal = saleLines.reduce(
      (total, line) => total + line.price * line.quantity,
      0,
    );
    const totalProductCost = saleLines.reduce(
      (total, line) => total + line.cost * line.quantity,
      0,
    );

    for (const [productId, quantities] of Array.from(
      saleQuantities.entries(),
    )) {
      const eventItem = eventItemsByProduct.get(productId)!;
      const updated = await tx.fairEventInventoryItem.updateMany({
        where: {
          id: eventItem.id,
          soldQuantity: eventItem.soldQuantity,
          packedQuantity: eventItem.packedQuantity,
        },
        data: {
          soldQuantity: { increment: quantities.direct + quantities.capsules },
          packedQuantity: { decrement: quantities.capsules },
        },
      });
      if (updated.count !== 1) {
        throw ErrorFactory.Conflict(
          "El inventario de feria cambió. Actualiza e intenta de nuevo",
        );
      }
    }

    const order = await tx.order.create({
      data: {
        storeId,
        fairEventId,
        idempotencyKey,
        orderNumber: generateOrderNumber(),
        fullName: "Consumidor final",
        status: OrderStatus.PAID,
        paidAt: new Date(),
        type: OrderType.FESTIVAL,
        subtotal,
        total: subtotal,
        totalProductCost,
        netProfit: subtotal - totalProductCost,
        profitMarginPct: subtotal
          ? ((subtotal - totalProductCost) / subtotal) * 100
          : 0,
        createdBy: userId,
        adminNotes: `Venta presencial · ${fairEvent.name}`,
        payment: {
          create: {
            storeId,
            method: paymentMethod,
            transactionId: payment.transactionId,
            proofKey: payment.proofKey,
            details: `Venta presencial · ${fairEvent.name}`,
          },
        },
      },
    });

    for (const line of saleLines) {
      const orderItem = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          name: line.name,
          sku: line.sku,
          imageUrl: line.imageUrl,
          price: line.price,
        },
      });
      if (line.capsuleId) {
        await tx.fairCapsule.update({
          where: { id: line.capsuleId },
          data: {
            status: FairCapsuleStatus.SOLD,
            orderItemId: orderItem.id,
            soldAt: new Date(),
          },
        });
      }
    }

    return {
      order: await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { payment: true, orderItems: true },
      }),
      duplicate: false,
    };
  });
}

/**
 * Anular una venta de feria. Una venta de feria nunca descontó
 * `Product.stock` (lo hizo la reserva), así que aquí NO se devuelve nada al
 * kardex: solo vuelve el contador `soldQuantity` del inventario de la feria y
 * una cápsula vendida regresa a «empacada». El pedido queda cancelado sin
 * `paidAt`. Después del cierre no se puede: lo conciliado ya es historia.
 */
export async function cancelFairSale({
  storeId,
  fairEventId,
  orderId,
  userId,
}: {
  storeId: string;
  fairEventId: string;
  orderId: string;
  userId: string;
}) {
  return prismadb.$transaction(async (tx) => {
    const fairEvent = await tx.fairEvent.findFirst({
      where: { id: fairEventId, storeId },
      select: { id: true, status: true, name: true },
    });
    if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
    if (
      fairEvent.status !== FairEventStatus.OPEN &&
      fairEvent.status !== FairEventStatus.RECONCILING
    ) {
      throw ErrorFactory.Conflict(
        "La feria ya está cerrada: sus ventas no se pueden anular",
      );
    }

    const order = await tx.order.findFirst({
      where: { id: orderId, storeId, fairEventId },
      include: { orderItems: true },
    });
    if (!order) throw ErrorFactory.NotFound("La venta no pertenece a esta feria");
    if (order.type !== OrderType.FESTIVAL) {
      throw ErrorFactory.Conflict("Solo se anulan ventas de feria");
    }
    if (order.status === OrderStatus.CANCELLED) {
      return order;
    }
    if (order.status !== OrderStatus.PAID) {
      throw ErrorFactory.Conflict(
        "Solo se puede anular una venta de feria pagada",
      );
    }

    const soldCapsules = await tx.fairCapsule.findMany({
      where: {
        fairEventId,
        orderItemId: { in: order.orderItems.map((item) => item.id) },
      },
      select: { id: true, productId: true, orderItemId: true },
    });
    const capsuleByItem = new Map(
      soldCapsules.map((capsule) => [capsule.orderItemId, capsule]),
    );

    for (const item of order.orderItems) {
      if (!item.productId) continue;
      const capsule = capsuleByItem.get(item.id);
      const reverted = await tx.fairEventInventoryItem.updateMany({
        where: {
          fairEventId,
          productId: item.productId,
          soldQuantity: { gte: item.quantity },
        },
        data: capsule
          ? {
              soldQuantity: { decrement: item.quantity },
              packedQuantity: { increment: item.quantity },
            }
          : { soldQuantity: { decrement: item.quantity } },
      });
      if (reverted.count !== 1) {
        throw ErrorFactory.Conflict(
          "El inventario de feria ya no cuadra con esta venta. Actualiza e intenta de nuevo",
        );
      }
      if (capsule) {
        await tx.fairCapsule.update({
          where: { id: capsule.id },
          data: {
            status: FairCapsuleStatus.PACKED,
            orderItemId: null,
            soldAt: null,
          },
        });
      }
    }

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.CANCELLED,
        paidAt: null,
        adminNotes: `${order.adminNotes ? `${order.adminNotes}\n` : ""}Anulada desde la feria por ${userId}`,
      },
      include: { orderItems: true, payment: true },
    });
  });
}

export async function reconcileFairEvent({
  storeId,
  fairEventId,
  items,
  userId,
}: {
  storeId: string;
  fairEventId: string;
  items: FairReconciliationInput[];
  userId: string;
}) {
  return prismadb.$transaction(async (tx) => {
    const fairEvent = await tx.fairEvent.findFirst({
      where: { id: fairEventId, storeId },
      include: {
        inventoryItems: {
          include: {
            product: true,
            kitComponents: {
              select: { componentId: true, quantityPerKit: true },
            },
          },
        },
      },
    });
    if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
    if (fairEvent.status !== FairEventStatus.RECONCILING) {
      throw ErrorFactory.Conflict(
        fairEvent.status === FairEventStatus.OPEN
          ? "Primero pasa la feria a conciliación para detener las ventas"
          : "La feria no está lista para conciliación",
      );
    }

    const itemsByProduct = new Map(items.map((item) => [item.productId, item]));
    if (itemsByProduct.size !== fairEvent.inventoryItems.length) {
      throw ErrorFactory.InvalidRequest(
        "Debes conciliar todos los productos asignados a la feria",
      );
    }

    for (const inventoryItem of fairEvent.inventoryItems) {
      const reconciliation = itemsByProduct.get(inventoryItem.productId);
      if (!reconciliation) {
        throw ErrorFactory.InvalidRequest(
          `Falta conciliar “${inventoryItem.product.name}”`,
        );
      }
      assertNonNegativeInteger(
        reconciliation.returnedQuantity,
        "La devolución",
      );
      assertNonNegativeInteger(reconciliation.damagedQuantity, "El daño");
      assertNonNegativeInteger(reconciliation.lostQuantity, "La pérdida");

      const expectedToReconcile =
        inventoryItem.allocatedQuantity - inventoryItem.soldQuantity;
      const counted =
        reconciliation.returnedQuantity +
        reconciliation.damagedQuantity +
        reconciliation.lostQuantity;
      if (counted !== expectedToReconcile) {
        throw ErrorFactory.InvalidRequest(
          `“${inventoryItem.product.name}” debe conciliar ${expectedToReconcile} unidades; recibimos ${counted}`,
        );
      }
    }

    // Las devoluciones entran por el helper del kardex, línea por línea: si
    // una no puede (producto borrado en medio de la feria) la feria se cierra
    // igual y la deuda queda como incidencia en Movimientos, en vez de dejar
    // la feria abierta para siempre.
    const kitComponentProducts = await loadKitComponentProducts(
      tx,
      fairEvent.inventoryItems.flatMap((item) =>
        (item.kitComponents ?? []).map((line) => line.componentId),
      ),
    );
    const returnMovements: CreateInventoryMovementParams[] = [];
    for (const inventoryItem of fairEvent.inventoryItems) {
      const reconciliation = itemsByProduct.get(inventoryItem.productId)!;
      if (reconciliation.returnedQuantity <= 0) continue;
      const kitLines = inventoryItem.kitComponents ?? [];
      if (kitLines.length > 0) {
        // Un kit devuelto devuelve sus piezas, con la receta congelada al
        // reservar: nada se escribe sobre el kit, que no tiene stock propio.
        for (const line of kitLines) {
          // Una pieza que ya no existe entra igual al lote: el helper la
          // reporta como «Producto no encontrado» y queda como incidencia.
          const component = kitComponentProducts.get(line.componentId);
          returnMovements.push({
            productId: line.componentId,
            storeId,
            type: InventoryMovementType.FESTIVAL_RETURN,
            quantity: reconciliation.returnedQuantity * line.quantityPerKit,
            reason: `Devuelto de feria: ${fairEvent.name} · kit «${inventoryItem.product.name}» × ${reconciliation.returnedQuantity}`,
            referenceId: fairEventId,
            cost: Number(component?.acqPrice) || 0,
            price: Number(component?.price) || 0,
            createdBy: movementActor(userId),
          });
        }
        continue;
      }
      returnMovements.push({
        productId: inventoryItem.productId,
        storeId,
        type: InventoryMovementType.FESTIVAL_RETURN,
        quantity: reconciliation.returnedQuantity,
        reason: `Devuelto de feria: ${fairEvent.name}`,
        referenceId: fairEventId,
        cost: Number(inventoryItem.product.acqPrice) || 0,
        price: Number(inventoryItem.product.price) || 0,
        createdBy: movementActor(userId),
      });
    }
    const returns = await createInventoryMovementBatchResilient(
      tx,
      returnMovements,
    );
    const issueCount = await recordInventoryIssues(tx, {
      storeId,
      orderId: null,
      orderNumber: formatFairIssueReference(fairEvent.name),
      kind: "RESTOCK",
      failed: returns.failed,
    });

    for (const inventoryItem of fairEvent.inventoryItems) {
      const reconciliation = itemsByProduct.get(inventoryItem.productId)!;
      await tx.fairEventInventoryItem.update({
        where: { id: inventoryItem.id },
        data: {
          returnedQuantity: reconciliation.returnedQuantity,
          damagedQuantity: reconciliation.damagedQuantity,
          lostQuantity: reconciliation.lostQuantity,
        },
      });
    }

    await tx.fairCapsule.updateMany({
      where: { fairEventId, status: FairCapsuleStatus.PACKED },
      data: { status: FairCapsuleStatus.VOID, voidedAt: new Date() },
    });
    const productIds = Array.from(
      new Set(
        fairEvent.inventoryItems.flatMap((item) => [
          item.productId,
          ...(item.kitComponents ?? []).map((line) => line.componentId),
        ]),
      ),
    );
    const kitIds = await refreshAffectedKits(
      tx,
      productIds,
    );
    await queueMarketplaceStockSyncEvents(tx, [...productIds, ...kitIds]);

    const closed = await tx.fairEvent.update({
      where: { id: fairEventId },
      data: { status: FairEventStatus.CLOSED, closedAt: new Date() },
    });
    return { ...closed, inventoryIssues: issueCount };
  });
}
