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

import { ErrorFactory } from "@/lib/api-errors";
import { recalculateKitStock } from "@/lib/inventory";
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

export const getFairStockAvailability = (item: {
  allocatedQuantity: number;
  soldQuantity: number;
  packedQuantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
}) =>
  item.allocatedQuantity -
  item.soldQuantity -
  item.packedQuantity -
  item.returnedQuantity -
  item.damagedQuantity -
  item.lostQuantity;

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

  if (parentKits.length > 0) {
    await recalculateKitStock(
      tx as never,
      Array.from(new Set(parentKits.map((item) => item.kitId))),
    );
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
              images: { orderBy: { isMain: "desc" }, take: 1 },
            },
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
        take: 20,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          createdAt: true,
          payment: { select: { method: true } },
          orderItems: {
            select: { id: true, name: true, quantity: true, price: true },
          },
        },
      },
    },
  });

  if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
  return fairEvent;
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
      },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const [productId, quantity] of Array.from(
      aggregatedAllocations.entries(),
    )) {
      const product = productsById.get(productId);
      if (!product) throw ErrorFactory.NotFound("Producto no encontrado");

      const stockUpdate = await tx.product.updateMany({
        where: { id: productId, storeId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (stockUpdate.count !== 1) {
        throw ErrorFactory.InsufficientStock(
          product.name,
          product.stock,
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
          previousStock: product.stock,
          newStock: product.stock - quantity,
          cost: product.acqPrice ?? undefined,
          price: product.price,
          reason: `Asignado a feria: ${fairEvent.name}`,
          referenceId: fairEventId,
          createdBy: `USER_${userId}`,
        },
      });
    }

    await refreshAffectedKits(tx, productIds);
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

export async function createFairSale({
  storeId,
  fairEventId,
  items,
  paymentMethod,
  idempotencyKey,
  userId,
}: {
  storeId: string;
  fairEventId: string;
  items: FairSaleInput[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  userId: string;
}) {
  if (!idempotencyKey || idempotencyKey.length < 12) {
    throw ErrorFactory.InvalidRequest(
      "La venta requiere una clave de seguridad",
    );
  }
  if (!items.length) {
    throw ErrorFactory.InvalidRequest("Agrega al menos un producto a la venta");
  }

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
          cost: Number(eventItem.product.acqPrice || 0),
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
        inventoryItems: { include: { product: true } },
      },
    });
    if (!fairEvent) throw ErrorFactory.NotFound("Feria no encontrada");
    if (
      fairEvent.status !== FairEventStatus.OPEN &&
      fairEvent.status !== FairEventStatus.RECONCILING
    ) {
      throw ErrorFactory.Conflict("La feria no está lista para conciliación");
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

    for (const inventoryItem of fairEvent.inventoryItems) {
      const reconciliation = itemsByProduct.get(inventoryItem.productId)!;
      if (reconciliation.returnedQuantity > 0) {
        await tx.product.update({
          where: { id: inventoryItem.productId },
          data: { stock: { increment: reconciliation.returnedQuantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            storeId,
            productId: inventoryItem.productId,
            type: InventoryMovementType.FESTIVAL_RETURN,
            quantity: reconciliation.returnedQuantity,
            previousStock: inventoryItem.product.stock,
            newStock:
              inventoryItem.product.stock + reconciliation.returnedQuantity,
            cost: inventoryItem.product.acqPrice ?? undefined,
            price: inventoryItem.product.price,
            reason: `Devuelto de feria: ${fairEvent.name}`,
            referenceId: fairEventId,
            createdBy: `USER_${userId}`,
          },
        });
      }

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
    await refreshAffectedKits(
      tx,
      fairEvent.inventoryItems.map((item) => item.productId),
    );

    return tx.fairEvent.update({
      where: { id: fairEventId },
      data: { status: FairEventStatus.CLOSED, closedAt: new Date() },
    });
  });
}
