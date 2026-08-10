import {
  InventoryMovementType,
  OrderStatus,
  OrderType,
  PaymentMethod,
} from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { recalculateKitStock } from "@/lib/inventory";
import { queueMarketplaceStockSyncEvents } from "@/lib/mercadolibre/outbox";
import prismadb from "@/lib/prismadb";
import { generateOrderNumber } from "@/lib/utils";

export type PointOfSaleItemInput = {
  productId: string;
  quantity: number;
};

type ProductRequirement = {
  quantity: number;
  sourceNames: Set<string>;
};

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw ErrorFactory.InvalidRequest(
      `${label} debe ser un entero mayor a cero`,
    );
  }
}

function getOrderItemCost(product: {
  acqPrice: number | null;
  isKit: boolean;
  kitComponents: { quantity: number; component: { acqPrice: number | null } }[];
}) {
  if (!product.isKit) return Number(product.acqPrice || 0);

  return product.kitComponents.reduce(
    (total, component) =>
      total + Number(component.component.acqPrice || 0) * component.quantity,
    0,
  );
}

function mergePhysicalRequirement(
  requirements: Map<string, ProductRequirement>,
  productId: string,
  quantity: number,
  sourceName: string,
) {
  const current = requirements.get(productId) || {
    quantity: 0,
    sourceNames: new Set<string>(),
  };
  current.quantity += quantity;
  current.sourceNames.add(sourceName);
  requirements.set(productId, current);
}

export async function createPointOfSaleSale({
  storeId,
  items,
  paymentMethod,
  idempotencyKey,
  userId,
}: {
  storeId: string;
  items: PointOfSaleItemInput[];
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  userId: string;
}) {
  if (!idempotencyKey || idempotencyKey.length < 12) {
    throw ErrorFactory.InvalidRequest(
      "La venta requiere una clave de seguridad",
    );
  }
  if (items.length === 0) {
    throw ErrorFactory.InvalidRequest("Agrega al menos un producto a la venta");
  }

  const requestedQuantities = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) {
      throw ErrorFactory.InvalidRequest("Cada producto debe estar seleccionado");
    }
    assertPositiveInteger(item.quantity, "La cantidad");
    requestedQuantities.set(
      item.productId,
      (requestedQuantities.get(item.productId) || 0) + item.quantity,
    );
  }

  return prismadb.$transaction(async (tx) => {
    const existingOrder = await tx.order.findFirst({
      where: { storeId, idempotencyKey, type: OrderType.POINT_OF_SALE },
      include: { payment: true, orderItems: true },
    });
    if (existingOrder) return { order: existingOrder, duplicate: true };

    const selectedProducts = await tx.product.findMany({
      where: {
        id: { in: Array.from(requestedQuantities.keys()) },
        storeId,
        isArchived: false,
      },
      include: {
        images: { orderBy: { isMain: "desc" }, take: 1 },
        kitComponents: {
          include: {
            component: {
              select: {
                id: true,
                name: true,
                stock: true,
                acqPrice: true,
                isArchived: true,
                isKit: true,
                storeId: true,
              },
            },
          },
        },
      },
    });
    const productsById = new Map(
      selectedProducts.map((product) => [product.id, product]),
    );

    if (productsById.size !== requestedQuantities.size) {
      throw ErrorFactory.NotFound("Uno o más productos ya no están disponibles");
    }

    const physicalRequirements = new Map<string, ProductRequirement>();
    for (const [productId, quantity] of Array.from(
      requestedQuantities.entries(),
    )) {
      const product = productsById.get(productId)!;
      if (!product.isKit) {
        mergePhysicalRequirement(
          physicalRequirements,
          product.id,
          quantity,
          product.name,
        );
        continue;
      }

      if (product.kitComponents.length === 0) {
        throw ErrorFactory.InvalidRequest(
          `El kit “${product.name}” no tiene productos configurados`,
        );
      }

      for (const kitComponent of product.kitComponents) {
        if (
          kitComponent.quantity <= 0 ||
          kitComponent.component.storeId !== storeId ||
          kitComponent.component.isArchived ||
          kitComponent.component.isKit
        ) {
          throw ErrorFactory.InvalidRequest(
            `El kit “${product.name}” tiene una configuración de inventario no válida`,
          );
        }
        mergePhysicalRequirement(
          physicalRequirements,
          kitComponent.componentId,
          kitComponent.quantity * quantity,
          product.name,
        );
      }
    }

    const physicalProductIds = Array.from(physicalRequirements.keys());
    const physicalProducts = await tx.product.findMany({
      where: {
        id: { in: physicalProductIds },
        storeId,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        stock: true,
        price: true,
        acqPrice: true,
      },
    });
    const physicalProductsById = new Map(
      physicalProducts.map((product) => [product.id, product]),
    );

    const insufficientItems = physicalProductIds.flatMap((productId) => {
      const product = physicalProductsById.get(productId);
      const requested = physicalRequirements.get(productId)!.quantity;
      if (!product || product.stock < requested) {
        return [
          {
            productId,
            productName: product?.name || "Producto no encontrado",
            available: product?.stock || 0,
            requested,
          },
        ];
      }
      return [];
    });
    if (insufficientItems.length > 0) {
      throw ErrorFactory.MultipleInsufficientStock(insufficientItems);
    }

    const selectedLines = Array.from(
      requestedQuantities,
      ([productId, quantity]) => {
        const product = productsById.get(productId)!;
        const price = Number(product.price);
        const cost = getOrderItemCost(product);
        return {
          productId,
          quantity,
          name: product.name,
          sku: product.sku,
          imageUrl: product.images[0]?.url || "",
          price,
          cost,
        };
      },
    );
    const subtotal = selectedLines.reduce(
      (total, line) => total + line.price * line.quantity,
      0,
    );
    const totalProductCost = selectedLines.reduce(
      (total, line) => total + line.cost * line.quantity,
      0,
    );

    const order = await tx.order.create({
      data: {
        storeId,
        idempotencyKey,
        orderNumber: generateOrderNumber(),
        fullName: "Consumidor final",
        status: OrderStatus.PAID,
        paidAt: new Date(),
        type: OrderType.POINT_OF_SALE,
        subtotal,
        total: subtotal,
        totalProductCost,
        netProfit: subtotal - totalProductCost,
        profitMarginPct: subtotal
          ? ((subtotal - totalProductCost) / subtotal) * 100
          : 0,
        createdBy: userId,
        adminNotes: "Venta presencial · Punto de venta",
        payment: {
          create: {
            storeId,
            method: paymentMethod,
            details: "Venta presencial · Punto de venta",
          },
        },
      },
    });

    for (const [productId, requirement] of Array.from(
      physicalRequirements.entries(),
    )) {
      const product = physicalProductsById.get(productId)!;
      const stockUpdate = await tx.product.updateMany({
        where: {
          id: productId,
          storeId,
          stock: { gte: requirement.quantity },
        },
        data: { stock: { decrement: requirement.quantity } },
      });
      if (stockUpdate.count !== 1) {
        throw ErrorFactory.Conflict(
          "El inventario cambió mientras registrabas la venta. Actualiza e intenta de nuevo.",
        );
      }

      await tx.inventoryMovement.create({
        data: {
          storeId,
          productId,
          type: InventoryMovementType.IN_PERSON_SALE,
          quantity: -requirement.quantity,
          previousStock: product.stock,
          newStock: product.stock - requirement.quantity,
          cost: product.acqPrice ?? undefined,
          price: product.price,
          reason: `Venta presencial: ${Array.from(requirement.sourceNames).join(", ")}`,
          referenceId: order.id,
          createdBy: `USER_${userId}`,
        },
      });
    }

    await tx.orderItem.createMany({
      data: selectedLines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        quantity: line.quantity,
        name: line.name,
        sku: line.sku,
        imageUrl: line.imageUrl,
        price: line.price,
      })),
    });

    const parentKits = await tx.productKit.findMany({
      where: { componentId: { in: physicalProductIds } },
      select: { kitId: true },
    });
    const kitIds = Array.from(
      new Set([
        ...selectedProducts
          .filter((product) => product.isKit)
          .map((product) => product.id),
        ...parentKits.map((item) => item.kitId),
      ]),
    );
    await recalculateKitStock(tx as never, kitIds);
    await queueMarketplaceStockSyncEvents(tx, [
      ...physicalProductIds,
      ...kitIds,
    ]);

    return {
      order: await tx.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { payment: true, orderItems: true },
      }),
      duplicate: false,
    };
  });
}
