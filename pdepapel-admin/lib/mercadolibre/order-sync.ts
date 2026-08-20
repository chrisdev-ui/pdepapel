import {
  InventoryMovementType,
  MarketplaceInventoryStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";

import { recalculateKitStock } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";

import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceOrderFinancials,
  queueMarketplaceOrderNotification,
  queueMarketplaceStockSyncEvents,
} from "./outbox";

type MercadoLibreOrderItem = {
  externalItemId: string;
  externalVariationId: string | null;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
};

type MercadoLibreOrder = {
  externalOrderId: string;
  externalPackId: string | null;
  status: MarketplaceOrderStatus;
  paidAt: Date | null;
  shipmentId: string | null;
  buyerName: string | null;
  totalAmount: number;
  currencyId: string | null;
  lastRemoteUpdateAt: Date | null;
  items: MercadoLibreOrderItem[];
};

type ResolvedMercadoLibreOrderItem = MercadoLibreOrderItem & {
  listingId: string | null;
  productId: string | null;
  stockSafetyBuffer: number;
  syncStock: boolean;
};

class MarketplaceStockException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketplaceStockException";
  }
}

function getRequiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`La orden de Mercado Libre no incluye ${field}`);
}

function getOptionalString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getPositiveNumber(value: unknown, field: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new Error(`La orden de Mercado Libre incluye ${field} inválido`);
  }
  return numberValue;
}

function getOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getMarketplaceOrderStatus(status: string): MarketplaceOrderStatus {
  if (status === "paid") return MarketplaceOrderStatus.PAID;
  if (["cancelled", "invalid"].includes(status)) {
    return MarketplaceOrderStatus.CANCELLED;
  }
  return MarketplaceOrderStatus.PENDING;
}

function getBuyerName(buyer: unknown) {
  if (!buyer || typeof buyer !== "object" || Array.isArray(buyer)) return null;
  const data = buyer as Record<string, unknown>;
  const fullName = [data.first_name, data.last_name]
    .filter((name): name is string => typeof name === "string" && Boolean(name))
    .join(" ")
    .trim();
  if (fullName) return fullName;
  return getOptionalString(data.nickname);
}

export function parseMercadoLibreOrder(
  payload: Record<string, unknown>,
): MercadoLibreOrder {
  const rawItems = payload.order_items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("La orden de Mercado Libre no contiene productos");
  }

  const items = rawItems.map((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      throw new Error(
        "La orden de Mercado Libre contiene un producto inválido",
      );
    }
    const line = rawItem as Record<string, unknown>;
    const item = line.item;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(
        "La orden de Mercado Libre no identifica uno de sus productos",
      );
    }
    const product = item as Record<string, unknown>;

    return {
      externalItemId: getRequiredString(product.id, "el producto publicado"),
      externalVariationId: getOptionalString(product.variation_id),
      title:
        getOptionalString(product.title) ??
        getOptionalString(line.title) ??
        "Producto de Mercado Libre",
      sku: getOptionalString(product.seller_sku),
      quantity: getPositiveNumber(line.quantity, "la cantidad"),
      unitPrice: getPositiveNumber(line.unit_price, "el precio unitario"),
    };
  });

  const rawStatus = getRequiredString(
    payload.status,
    "el estado",
  ).toLowerCase();
  const totalAmount = Number(payload.total_amount);
  const calculatedTotal = items.reduce(
    (total, item) => total + item.quantity * item.unitPrice,
    0,
  );
  const shipping =
    payload.shipping &&
    typeof payload.shipping === "object" &&
    !Array.isArray(payload.shipping)
      ? (payload.shipping as Record<string, unknown>)
      : null;

  return {
    externalOrderId: getRequiredString(payload.id, "el identificador"),
    externalPackId: getOptionalString(payload.pack_id),
    status: getMarketplaceOrderStatus(rawStatus),
    paidAt:
      rawStatus === "paid"
        ? (getOptionalDate(payload.date_closed) ?? new Date())
        : null,
    shipmentId: getOptionalString(shipping?.id),
    buyerName: getBuyerName(payload.buyer),
    totalAmount:
      Number.isFinite(totalAmount) && totalAmount >= 0
        ? totalAmount
        : calculatedTotal,
    currencyId: getOptionalString(payload.currency_id),
    lastRemoteUpdateAt: getOptionalDate(payload.date_last_updated),
    items,
  };
}

async function resolveOrderItems(
  connectionId: string,
  items: MercadoLibreOrderItem[],
) {
  const externalItemIds = Array.from(
    new Set(items.map((item) => item.externalItemId)),
  );
  const listings = await prismadb.marketplaceListing.findMany({
    where: {
      connectionId,
      externalItemId: { in: externalItemIds },
    },
    select: {
      id: true,
      productId: true,
      externalItemId: true,
      externalVariationId: true,
      stockSafetyBuffer: true,
      syncStock: true,
    },
  });

  return items.map((item): ResolvedMercadoLibreOrderItem => {
    const listing = listings.find(
      (candidate) =>
        candidate.externalItemId === item.externalItemId &&
        (candidate.externalVariationId ?? null) === item.externalVariationId,
    );

    return {
      ...item,
      listingId: listing?.id ?? null,
      productId: listing?.productId ?? null,
      stockSafetyBuffer: listing?.stockSafetyBuffer ?? 0,
      syncStock: listing?.syncStock ?? false,
    };
  });
}

async function applyMarketplaceInventory(
  marketplaceOrderId: string,
  storeId: string,
  orderItems: ResolvedMercadoLibreOrderItem[],
  externalOrderId: string,
) {
  const quantitiesByProductId = new Map<string, number>();
  for (const item of orderItems) {
    if (!item.productId) {
      throw new MarketplaceStockException(
        "Hay productos de Mercado Libre sin relación con P de Papel",
      );
    }
    quantitiesByProductId.set(
      item.productId,
      (quantitiesByProductId.get(item.productId) ?? 0) + item.quantity,
    );
  }

  return prismadb.$transaction(async (transaction) => {
    const claim = await transaction.marketplaceOrder.updateMany({
      where: {
        id: marketplaceOrderId,
        inventoryStatus: MarketplaceInventoryStatus.NOT_APPLIED,
      },
      data: {
        inventoryStatus: MarketplaceInventoryStatus.DECREMENTED,
        inventoryAppliedAt: new Date(),
        inventoryError: null,
      },
    });
    if (claim.count === 0) return false;

    const productIds = Array.from(quantitiesByProductId.keys());
    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true, name: true, stock: true, acqPrice: true },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const [productId, quantity] of Array.from(
      quantitiesByProductId.entries(),
    )) {
      const product = productById.get(productId);
      if (!product || product.stock < quantity) {
        throw new MarketplaceStockException(
          `Stock insuficiente para la venta de Mercado Libre: ${product?.name ?? productId}`,
        );
      }
    }

    for (const [productId, quantity] of Array.from(
      quantitiesByProductId.entries(),
    )) {
      const update = await transaction.product.updateMany({
        where: { id: productId, storeId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (update.count !== 1) {
        throw new MarketplaceStockException(
          "El stock cambió mientras se procesaba la venta de Mercado Libre",
        );
      }
    }

    const updatedProducts = await transaction.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, stock: true, acqPrice: true },
    });
    const updatedProductById = new Map(
      updatedProducts.map((product) => [product.id, product]),
    );
    const runningStockByProductId = new Map(
      Array.from(quantitiesByProductId, ([productId, quantity]) => [
        productId,
        (updatedProductById.get(productId)?.stock ?? 0) + quantity,
      ]),
    );

    for (const item of orderItems) {
      const productId = item.productId!;
      const previousStock = runningStockByProductId.get(productId) ?? 0;
      const newStock = previousStock - item.quantity;
      runningStockByProductId.set(productId, newStock);

      await transaction.inventoryMovement.create({
        data: {
          storeId,
          productId,
          type: InventoryMovementType.ORDER_PLACED,
          quantity: -item.quantity,
          previousStock,
          newStock,
          reason: `Mercado Libre: venta confirmada ${externalOrderId}`,
          referenceId: marketplaceOrderId,
          cost: updatedProductById.get(productId)?.acqPrice ?? null,
          price: item.unitPrice,
          createdBy: "SYSTEM_MERCADOLIBRE",
        },
      });
    }

    const parentKits = await transaction.productKit.findMany({
      where: { componentId: { in: productIds } },
      select: { kitId: true },
    });
    const parentKitIds = Array.from(
      new Set(parentKits.map((parentKit) => parentKit.kitId)),
    );
    await recalculateKitStock(transaction, parentKitIds);

    await queueMarketplaceStockSyncEvents(
      transaction,
      Array.from(new Set([...productIds, ...parentKitIds])),
    );

    return true;
  });
}

async function queuePaidOrderNotification(
  connectionId: string,
  externalOrderId: string,
  marketplaceOrderId: string,
  needsFinancialReconciliation: boolean,
  shouldSendNotification: boolean,
) {
  let hasQueuedWork = false;
  if (needsFinancialReconciliation) {
    await queueMarketplaceOrderFinancials(prismadb, {
      connectionId,
      externalOrderId,
      marketplaceOrderId,
    });
    hasQueuedWork = true;
  }
  if (shouldSendNotification) {
    await queueMarketplaceOrderNotification(prismadb, {
      connectionId,
      externalOrderId,
      marketplaceOrderId,
    });
    hasQueuedWork = true;
  }
  if (!hasQueuedWork) return;

  try {
    await enqueuePendingMarketplaceOutboxEvents(connectionId);
  } catch (error) {
    console.error("Mercado Libre order notification dispatch deferred", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}

export function isMercadoLibreOrderNewlyPaid(
  previousStatus: MarketplaceOrderStatus | null,
  nextStatus: MarketplaceOrderStatus,
) {
  return (
    nextStatus === MarketplaceOrderStatus.PAID &&
    previousStatus !== MarketplaceOrderStatus.PAID
  );
}

async function cancelPendingMercadoLibreShipments({
  connectionId,
  marketplaceOrderId,
  externalShipmentId,
  lastRemoteUpdateAt,
}: {
  connectionId: string;
  marketplaceOrderId: string;
  externalShipmentId: string | null;
  lastRemoteUpdateAt: Date | null;
}) {
  await prismadb.marketplaceShipment.updateMany({
    where: {
      connectionId,
      status: {
        in: ["pending", "handling", "ready_to_ship"],
      },
      OR: [
        { marketplaceOrderId },
        ...(externalShipmentId
          ? [{ externalShipmentId }]
          : []),
      ],
    },
    data: {
      status: "cancelled",
      substatus: "cancelled_with_order",
      lastRemoteUpdateAt: lastRemoteUpdateAt ?? new Date(),
    },
  });
}

export async function synchronizeMercadoLibreOrder(
  connectionId: string,
  storeId: string,
  payload: Record<string, unknown>,
) {
  const order = parseMercadoLibreOrder(payload);
  const resolvedItems = await resolveOrderItems(connectionId, order.items);
  const existingMarketplaceOrder = await prismadb.marketplaceOrder.findUnique({
    where: {
      connectionId_externalOrderId: {
        connectionId,
        externalOrderId: order.externalOrderId,
      },
    },
    select: { status: true },
  });
  const shouldSendNotification = isMercadoLibreOrderNewlyPaid(
    existingMarketplaceOrder?.status ?? null,
    order.status,
  );
  const marketplaceOrder = await prismadb.marketplaceOrder.upsert({
    where: {
      connectionId_externalOrderId: {
        connectionId,
        externalOrderId: order.externalOrderId,
      },
    },
    update: {
      externalPackId: order.externalPackId,
      status: order.status,
      ...(order.paidAt ? { paidAt: order.paidAt } : {}),
      shipmentId: order.shipmentId,
      buyerName: order.buyerName,
      totalAmount: order.totalAmount,
      currencyId: order.currencyId,
      lastRemoteUpdateAt: order.lastRemoteUpdateAt,
      items: {
        deleteMany: {},
        create: resolvedItems.map((item) => ({
          listingId: item.listingId,
          productId: item.productId,
          externalItemId: item.externalItemId,
          externalVariationId: item.externalVariationId,
          title: item.title,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      },
    },
    create: {
      connectionId,
      externalOrderId: order.externalOrderId,
      externalPackId: order.externalPackId,
      status: order.status,
      paidAt: order.paidAt,
      shipmentId: order.shipmentId,
      buyerName: order.buyerName,
      totalAmount: order.totalAmount,
      currencyId: order.currencyId,
      lastRemoteUpdateAt: order.lastRemoteUpdateAt,
      items: {
        create: resolvedItems.map((item) => ({
          listingId: item.listingId,
          productId: item.productId,
          externalItemId: item.externalItemId,
          externalVariationId: item.externalVariationId,
          title: item.title,
          sku: item.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      },
    },
    select: { id: true, inventoryStatus: true, netAmount: true },
  });

  if (order.status === MarketplaceOrderStatus.CANCELLED) {
    await cancelPendingMercadoLibreShipments({
      connectionId,
      marketplaceOrderId: marketplaceOrder.id,
      externalShipmentId: order.shipmentId,
      lastRemoteUpdateAt: order.lastRemoteUpdateAt,
    });
    if (
      marketplaceOrder.inventoryStatus ===
      MarketplaceInventoryStatus.DECREMENTED
    ) {
      await prismadb.marketplaceOrder.update({
        where: { id: marketplaceOrder.id },
        data: {
          inventoryStatus: MarketplaceInventoryStatus.RESTOCK_PENDING,
          inventoryError:
            "La venta fue cancelada. Confirma el retorno físico antes de devolver unidades al inventario.",
        },
      });
    }
    return { inventoryChanged: false, needsAttention: false };
  }

  if (order.status !== MarketplaceOrderStatus.PAID) {
    return { inventoryChanged: false, needsAttention: false };
  }

  const unmappedItems = resolvedItems.filter((item) => !item.productId);
  if (unmappedItems.length > 0) {
    await prismadb.marketplaceOrder.update({
      where: { id: marketplaceOrder.id },
      data: {
        inventoryStatus: MarketplaceInventoryStatus.EXCEPTION,
        inventoryError: `Sin relación local: ${unmappedItems
          .map((item) => item.title)
          .join(", ")}`,
      },
    });
    await queuePaidOrderNotification(
      connectionId,
      order.externalOrderId,
      marketplaceOrder.id,
      marketplaceOrder.netAmount === null,
      shouldSendNotification,
    );
    return { inventoryChanged: false, needsAttention: true };
  }

  try {
    const inventoryChanged = await applyMarketplaceInventory(
      marketplaceOrder.id,
      storeId,
      resolvedItems,
      order.externalOrderId,
    );
    await queuePaidOrderNotification(
      connectionId,
      order.externalOrderId,
      marketplaceOrder.id,
      marketplaceOrder.netAmount === null,
      shouldSendNotification,
    );
    return { inventoryChanged, needsAttention: false };
  } catch (error) {
    if (error instanceof MarketplaceStockException) {
      await prismadb.marketplaceOrder.update({
        where: { id: marketplaceOrder.id },
        data: {
          inventoryStatus: MarketplaceInventoryStatus.EXCEPTION,
          inventoryError: error.message,
        },
      });
      await queuePaidOrderNotification(
        connectionId,
        order.externalOrderId,
        marketplaceOrder.id,
        marketplaceOrder.netAmount === null,
        shouldSendNotification,
      );
      return { inventoryChanged: false, needsAttention: true };
    }
    throw error;
  }
}
