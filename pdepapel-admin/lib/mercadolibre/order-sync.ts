import {
  InventoryMovementType,
  MarketplaceInventoryStatus,
  MarketplaceOrderStatus,
  type Prisma,
} from "@prisma/client";

import { explodeSaleLines, recalculateKitStock } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";

import {
  isReturnMarketplaceOrderStatus,
  isRevenueMarketplaceOrderStatus,
} from "./order-status";
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

export type MercadoLibreOrderRefund = {
  /** Suma de `transaction_amount_refunded` de los pagos. */
  amount: number;
  /** Por qué la venta dejó de contar (o cuenta menos) como ingreso. */
  reason: "partially_refunded" | "pending_cancel" | "charged_back" | "refund" | null;
  rawStatus: string;
};

type MercadoLibreOrder = {
  externalOrderId: string;
  externalPackId: string | null;
  status: MarketplaceOrderStatus;
  refund: MercadoLibreOrderRefund;
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
  acqPrice: number | null;
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

/**
 * Pagos de la orden: lo devuelto al comprador y si hubo contracargo. Mercado
 * Libre deja la orden en `paid` aunque devuelva dinero, así que el reembolso
 * solo se ve aquí.
 */
function getPaymentsRefund(payments: unknown) {
  if (!Array.isArray(payments)) return { amount: 0, chargedBack: false };
  return payments.reduce(
    (summary, payment) => {
      if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
        return summary;
      }
      const data = payment as Record<string, unknown>;
      const refunded = Number(data.transaction_amount_refunded);
      return {
        amount:
          summary.amount +
          (Number.isFinite(refunded) && refunded > 0 ? refunded : 0),
        chargedBack:
          summary.chargedBack ||
          getOptionalString(data.status)?.toLowerCase() === "charged_back",
      };
    },
    { amount: 0, chargedBack: false },
  );
}

/**
 * Estado interno a partir del estado crudo y de los pagos. Regla: la venta se
 * queda en PAID mientras Mercado Libre la tenga en `paid` (el reembolso se
 * registra aparte y se resta del neto); `partially_refunded` cuenta como
 * ingreso por su neto real; `pending_cancel` y un contracargo dejan de contar
 * como ingreso. Nada cae en PENDING por accidente.
 */
export function getMarketplaceOrderStatus(
  status: string,
  refund: { amount: number; chargedBack: boolean } = {
    amount: 0,
    chargedBack: false,
  },
): { status: MarketplaceOrderStatus; reason: MercadoLibreOrderRefund["reason"] } {
  if (["cancelled", "invalid"].includes(status)) {
    return { status: MarketplaceOrderStatus.CANCELLED, reason: null };
  }
  if (refund.chargedBack) {
    return { status: MarketplaceOrderStatus.REFUNDED, reason: "charged_back" };
  }
  if (status === "partially_refunded") {
    return {
      status: MarketplaceOrderStatus.PARTIALLY_REFUNDED,
      reason: "partially_refunded",
    };
  }
  if (status === "pending_cancel") {
    return { status: MarketplaceOrderStatus.REFUNDED, reason: "pending_cancel" };
  }
  if (status === "paid") {
    return {
      status: MarketplaceOrderStatus.PAID,
      reason: refund.amount > 0 ? "refund" : null,
    };
  }
  return { status: MarketplaceOrderStatus.PENDING, reason: null };
}

/** Estados crudos en los que el comprador ya pagó (aunque luego se devuelva parte). */
const PAID_RAW_STATUSES = ["paid", "partially_refunded", "pending_cancel"];

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
  const paymentsRefund = getPaymentsRefund(payload.payments);
  const mapped = getMarketplaceOrderStatus(rawStatus, paymentsRefund);
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
    status: mapped.status,
    refund: {
      amount: paymentsRefund.amount,
      reason: mapped.reason,
      rawStatus,
    },
    paidAt:
      PAID_RAW_STATUSES.includes(rawStatus) || paymentsRefund.chargedBack
        ? (getOptionalDate(payload.date_closed) ??
          getOptionalDate(payload.date_created) ??
          new Date())
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

function getOrderItemKey(item: {
  externalItemId: string;
  externalVariationId: string | null;
}) {
  return `${item.externalItemId}:${item.externalVariationId ?? ""}`;
}

async function resolveOrderItems(
  connectionId: string,
  externalOrderId: string,
  items: MercadoLibreOrderItem[],
) {
  const externalItemIds = Array.from(
    new Set(items.map((item) => item.externalItemId)),
  );
  const [listings, existingOrder] = await Promise.all([
    prismadb.marketplaceListing.findMany({
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
    }),
    prismadb.marketplaceOrder.findUnique({
      where: {
        connectionId_externalOrderId: { connectionId, externalOrderId },
      },
      select: {
        items: {
          select: {
            externalItemId: true,
            externalVariationId: true,
            acqPrice: true,
          },
        },
      },
    }),
  ]);

  const productIds = Array.from(
    new Set(
      listings.flatMap((listing) =>
        listing.productId ? [listing.productId] : [],
      ),
    ),
  );
  const products =
    productIds.length > 0
      ? await prismadb.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, acqPrice: true },
        })
      : [];
  const acqPriceByProductId = new Map(
    products.map((product) => [product.id, product.acqPrice]),
  );
  // A paid sale is a historical record: never overwrite a cost snapshot that was
  // already captured, only fill it in when it is still missing.
  const existingAcqPriceByItemKey = new Map(
    (existingOrder?.items ?? []).map((item) => [
      getOrderItemKey(item),
      item.acqPrice,
    ]),
  );

  return items.map((item): ResolvedMercadoLibreOrderItem => {
    const listing = listings.find(
      (candidate) =>
        candidate.externalItemId === item.externalItemId &&
        (candidate.externalVariationId ?? null) === item.externalVariationId,
    );
    const currentAcqPrice = listing?.productId
      ? (acqPriceByProductId.get(listing.productId) ?? null)
      : null;
    const existingAcqPrice =
      existingAcqPriceByItemKey.get(getOrderItemKey(item)) ?? null;

    return {
      ...item,
      listingId: listing?.id ?? null,
      productId: listing?.productId ?? null,
      acqPrice: existingAcqPrice ?? currentAcqPrice,
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
  connectionId: string,
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

    // Un kit no tiene stock propio: lo que sale de bodega son sus componentes.
    // Sin esto la venta descuenta la columna del kit, los componentes siguen
    // intactos y el siguiente movimiento de un componente borra la venta.
    const physicalLines = await explodeSaleLines(
      transaction,
      orderItems.map((item) => ({
        productId: item.productId!,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    );

    const physicalByProductId = new Map<string, number>();
    for (const line of physicalLines) {
      physicalByProductId.set(
        line.physicalProductId,
        (physicalByProductId.get(line.physicalProductId) ?? 0) +
          line.physicalQuantity,
      );
    }

    const soldProductIds = Array.from(quantitiesByProductId.keys());
    const physicalProductIds = Array.from(physicalByProductId.keys());

    const products = await transaction.product.findMany({
      where: { id: { in: physicalProductIds }, storeId },
      select: { id: true, name: true, stock: true, acqPrice: true },
    });
    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const [productId, quantity] of Array.from(
      physicalByProductId.entries(),
    )) {
      const product = productById.get(productId);
      if (!product || product.stock < quantity) {
        throw new MarketplaceStockException(
          `Stock insuficiente para la venta de Mercado Libre: ${product?.name ?? productId}`,
        );
      }
    }

    for (const [productId, quantity] of Array.from(
      physicalByProductId.entries(),
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
      where: { id: { in: physicalProductIds } },
      select: { id: true, stock: true, acqPrice: true },
    });
    const updatedProductById = new Map(
      updatedProducts.map((product) => [product.id, product]),
    );
    const runningStockByProductId = new Map(
      Array.from(physicalByProductId, ([productId, quantity]) => [
        productId,
        (updatedProductById.get(productId)?.stock ?? 0) + quantity,
      ]),
    );

    for (const line of physicalLines) {
      const productId = line.physicalProductId;
      const previousStock = runningStockByProductId.get(productId) ?? 0;
      const newStock = previousStock - line.physicalQuantity;
      runningStockByProductId.set(productId, newStock);

      await transaction.inventoryMovement.create({
        data: {
          storeId,
          productId,
          type: InventoryMovementType.ORDER_PLACED,
          quantity: -line.physicalQuantity,
          previousStock,
          newStock,
          reason: line.kitName
            ? `Mercado Libre: venta confirmada ${externalOrderId} (Kit: ${line.kitName})`
            : `Mercado Libre: venta confirmada ${externalOrderId}`,
          referenceId: marketplaceOrderId,
          cost: updatedProductById.get(productId)?.acqPrice ?? null,
          // El precio del kit no es el precio del componente.
          price: line.kitId ? null : line.unitPrice,
          createdBy: "SYSTEM_MERCADOLIBRE",
        },
      });
    }

    const parentKits = await transaction.productKit.findMany({
      where: { componentId: { in: physicalProductIds } },
      select: { kitId: true },
    });
    const parentKitIds = Array.from(
      new Set(parentKits.map((parentKit) => parentKit.kitId)),
    );
    await recalculateKitStock(transaction, parentKitIds);

    await queueMarketplaceStockSyncEvents(
      transaction,
      Array.from(
        new Set([...soldProductIds, ...physicalProductIds, ...parentKitIds]),
      ),
    );

    // El aviso de venta se encola en la misma transacción que descuenta el
    // inventario y con clave por venta: si el proceso muere aquí, se
    // reintenta todo; si se reintenta después de haber pasado, la clave lo
    // deja en una sola. Antes dependía del estado leído antes del upsert y
    // un reintento lo perdía.
    await queueMarketplaceOrderNotification(transaction, {
      connectionId,
      externalOrderId,
      marketplaceOrderId,
    });

    return true;
  });
}

async function queuePaidOrderNotification(
  connectionId: string,
  externalOrderId: string,
  marketplaceOrderId: string,
  needsFinancialReconciliation: boolean,
  shouldSendNotification: boolean,
  resetFinancials = false,
) {
  let hasQueuedWork = false;
  if (needsFinancialReconciliation) {
    await queueMarketplaceOrderFinancials(prismadb, {
      connectionId,
      externalOrderId,
      marketplaceOrderId,
      reset: resetFinancials,
    });
    hasQueuedWork = true;
  }
  if (shouldSendNotification) {
    // Clave por venta: si ya se encoló dentro de la transacción de
    // inventario, este upsert no cambia nada.
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

/**
 * @deprecated El aviso ya no depende de comparar estados: se encola con clave
 * por venta dentro de la transacción de inventario. Se conserva para quien
 * necesite saber si una venta acaba de pasar a ingreso.
 */
export function isMercadoLibreOrderNewlyPaid(
  previousStatus: MarketplaceOrderStatus | null,
  nextStatus: MarketplaceOrderStatus,
) {
  return (
    isRevenueMarketplaceOrderStatus(nextStatus) &&
    (previousStatus === null || !isRevenueMarketplaceOrderStatus(previousStatus))
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
  const resolvedItems = await resolveOrderItems(
    connectionId,
    order.externalOrderId,
    order.items,
  );
  const existingMarketplaceOrder = await prismadb.marketplaceOrder.findUnique({
    where: {
      connectionId_externalOrderId: {
        connectionId,
        externalOrderId: order.externalOrderId,
      },
    },
    select: {
      status: true,
      inventoryStatus: true,
      refundedAmount: true,
      metadata: true,
    },
  });
  // Solo las rutas que no pasan por la transacción de inventario avisan
  // aquí (venta sin relación local o sin stock); la clave por venta evita
  // el correo duplicado si después el inventario sí se aplica.
  const shouldSendNotification = isRevenueMarketplaceOrderStatus(order.status);
  // Una venta con inventario ya aplicado es un registro histórico: sus
  // líneas no se vuelven a resolver contra las publicaciones de hoy (una
  // publicación desvinculada después dejaba la venta sin producto). Solo se
  // reconstruyen mientras el inventario no se haya aplicado.
  const canRebuildItems =
    !existingMarketplaceOrder ||
    existingMarketplaceOrder.inventoryStatus ===
      MarketplaceInventoryStatus.NOT_APPLIED ||
    existingMarketplaceOrder.inventoryStatus ===
      MarketplaceInventoryStatus.EXCEPTION;
  // Un reembolso nuevo o distinto obliga a recalcular el neto ya escrito.
  const refundChanged =
    (existingMarketplaceOrder?.refundedAmount ?? 0) !== order.refund.amount;
  const existingMetadata =
    existingMarketplaceOrder?.metadata &&
    typeof existingMarketplaceOrder.metadata === "object" &&
    !Array.isArray(existingMarketplaceOrder.metadata)
      ? (existingMarketplaceOrder.metadata as Record<string, unknown>)
      : {};
  const refundMetadata =
    order.refund.amount > 0 || order.refund.reason
      ? {
          refund: {
            amount: order.refund.amount,
            reason: order.refund.reason,
            rawStatus: order.refund.rawStatus,
            updatedAt: new Date().toISOString(),
          },
        }
      : {};
  const metadataUpdate =
    Object.keys(refundMetadata).length > 0 || "refund" in existingMetadata
      ? {
          metadata: {
            ...existingMetadata,
            ...refundMetadata,
            ...(Object.keys(refundMetadata).length === 0
              ? { refund: null }
              : {}),
          } as Prisma.InputJsonValue,
        }
      : {};
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
      refundedAmount: order.refund.amount > 0 ? order.refund.amount : null,
      ...metadataUpdate,
      ...(order.paidAt ? { paidAt: order.paidAt } : {}),
      shipmentId: order.shipmentId,
      buyerName: order.buyerName,
      totalAmount: order.totalAmount,
      currencyId: order.currencyId,
      lastRemoteUpdateAt: order.lastRemoteUpdateAt,
      ...(canRebuildItems
        ? {
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
                acqPrice: item.acqPrice,
              })),
            },
          }
        : {}),
    },
    create: {
      connectionId,
      externalOrderId: order.externalOrderId,
      externalPackId: order.externalPackId,
      status: order.status,
      refundedAmount: order.refund.amount > 0 ? order.refund.amount : null,
      ...(Object.keys(refundMetadata).length > 0
        ? { metadata: refundMetadata as Prisma.InputJsonValue }
        : {}),
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
          acqPrice: item.acqPrice,
        })),
      },
    },
    select: { id: true, inventoryStatus: true, netAmount: true },
  });

  if (isReturnMarketplaceOrderStatus(order.status)) {
    // Cancelada o reembolsada: el dinero volvió (o va a volver) y la
    // mercancía todavía no. Nunca se devuelve stock solo; queda pendiente de
    // confirmar el retorno físico.
    if (order.status === MarketplaceOrderStatus.CANCELLED) {
      await cancelPendingMercadoLibreShipments({
        connectionId,
        marketplaceOrderId: marketplaceOrder.id,
        externalShipmentId: order.shipmentId,
        lastRemoteUpdateAt: order.lastRemoteUpdateAt,
      });
    }
    if (
      marketplaceOrder.inventoryStatus ===
      MarketplaceInventoryStatus.DECREMENTED
    ) {
      await prismadb.marketplaceOrder.update({
        where: { id: marketplaceOrder.id },
        data: {
          inventoryStatus: MarketplaceInventoryStatus.RESTOCK_PENDING,
          inventoryError:
            order.status === MarketplaceOrderStatus.CANCELLED
              ? "La venta fue cancelada. Confirma el retorno físico antes de devolver unidades al inventario."
              : "Mercado Libre reembolsó la venta. Confirma el retorno físico antes de devolver unidades al inventario.",
        },
      });
    }
    return { inventoryChanged: false, needsAttention: false };
  }

  if (!isRevenueMarketplaceOrderStatus(order.status)) {
    return { inventoryChanged: false, needsAttention: false };
  }

  const needsFinancials = marketplaceOrder.netAmount === null || refundChanged;

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
      needsFinancials,
      shouldSendNotification,
      refundChanged && marketplaceOrder.netAmount !== null,
    );
    return { inventoryChanged: false, needsAttention: true };
  }

  try {
    const inventoryChanged = await applyMarketplaceInventory(
      marketplaceOrder.id,
      storeId,
      resolvedItems,
      order.externalOrderId,
      connectionId,
    );
    await queuePaidOrderNotification(
      connectionId,
      order.externalOrderId,
      marketplaceOrder.id,
      needsFinancials,
      shouldSendNotification,
      refundChanged && marketplaceOrder.netAmount !== null,
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
        needsFinancials,
        shouldSendNotification,
        refundChanged && marketplaceOrder.netAmount !== null,
      );
      return { inventoryChanged: false, needsAttention: true };
    }
    throw error;
  }
}
