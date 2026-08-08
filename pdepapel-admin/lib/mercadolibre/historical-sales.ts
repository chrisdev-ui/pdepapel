import {
  InventoryMovementType,
  MarketplaceInventoryStatus,
  MarketplaceListingStatus,
  MarketplaceOrderStatus,
  Prisma,
} from "@prisma/client";

import { recalculateKitStock } from "@/lib/inventory";
import prismadb from "@/lib/prismadb";

import { getMercadoLibreResource, requestMercadoLibreResource } from "./client";
import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceStockSyncEvents,
} from "./outbox";

type RemoteOrderItem = {
  externalItemId: string;
  externalVariationId: string | null;
  title: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
};

type RemoteOrder = {
  externalOrderId: string;
  externalPackId: string | null;
  status: string;
  paidAt: Date | null;
  totalAmount: number;
  currencyId: string | null;
  items: RemoteOrderItem[];
};

type HistoricalSaleItem = RemoteOrderItem & {
  linkedProduct: {
    id: string;
    name: string;
    sku: string;
    stock: number;
  } | null;
  suggestedProduct: {
    id: string;
    name: string;
    sku: string;
    stock: number;
  } | null;
};

export type HistoricalSaleInspection = {
  referenceType: "order" | "pack";
  pack: { id: string; status: string | null } | null;
  orders: {
    externalOrderId: string;
    status: string;
    paidAt: Date | null;
    totalAmount: number;
    currencyId: string | null;
    alreadyImported: boolean;
    inventoryStatus: MarketplaceInventoryStatus | null;
    items: HistoricalSaleItem[];
  }[];
};

export type HistoricalSaleFinancials = {
  marketplaceFee: number;
  shippingCost: number;
  taxesAmount: number;
};

type ProductMapping = RemoteOrderItem & {
  productId: string;
};

const REFERENCE_PATTERN = /^\d{8,30}$/;

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getRequiredString(value: unknown, field: string) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  throw new Error(`Mercado Libre no devolvió ${field}`);
}

function getOptionalString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getPositiveNumber(value: unknown, field: string) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    throw new Error(`Mercado Libre devolvió ${field} inválido`);
  }
  return numericValue;
}

function getOptionalDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validateReference(reference: string) {
  if (!REFERENCE_PATTERN.test(reference)) {
    throw new Error("El número de venta u orden de Mercado Libre no es válido");
  }
}

export function parseMercadoLibreHistoricalOrder(
  payload: Record<string, unknown>,
): RemoteOrder {
  const rawItems = payload.order_items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("La orden de Mercado Libre no contiene artículos");
  }

  const items = rawItems.map((rawItem) => {
    const line = asRecord(rawItem);
    const item = asRecord(line?.item);
    if (!line || !item) {
      throw new Error(
        "La orden de Mercado Libre contiene un artículo inválido",
      );
    }

    return {
      externalItemId: getRequiredString(item.id, "la publicación"),
      externalVariationId:
        getOptionalString(item.variation_id) ??
        getOptionalString(line.variation_id),
      title:
        getOptionalString(item.title) ??
        getOptionalString(line.title) ??
        "Producto de Mercado Libre",
      sku:
        getOptionalString(item.seller_sku) ??
        getOptionalString(item.seller_custom_field) ??
        getOptionalString(line.seller_sku) ??
        getOptionalString(line.seller_custom_field),
      quantity: getPositiveNumber(line.quantity, "la cantidad"),
      unitPrice: getPositiveNumber(line.unit_price, "el precio unitario"),
    };
  });

  const totalAmount = Number(payload.total_amount);
  const fallbackTotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  return {
    externalOrderId: getRequiredString(payload.id, "el identificador de orden"),
    externalPackId: getOptionalString(payload.pack_id),
    status: getRequiredString(payload.status, "el estado").toLowerCase(),
    paidAt: getOptionalDate(payload.date_closed),
    totalAmount:
      Number.isFinite(totalAmount) && totalAmount >= 0
        ? totalAmount
        : fallbackTotal,
    currencyId: getOptionalString(payload.currency_id),
    items,
  };
}

async function getRemoteOrdersForReference(
  connectionId: string,
  reference: string,
) {
  validateReference(reference);
  const packRequest = await requestMercadoLibreResource(
    connectionId,
    `/packs/${reference}`,
  );
  if (packRequest.ok && packRequest.payload) {
    const rawOrders = Array.isArray(packRequest.payload.orders)
      ? packRequest.payload.orders
      : [];
    const orderIds = rawOrders.flatMap((value) => {
      const order = asRecord(value);
      const id = getOptionalString(order?.id);
      return id ? [id] : [];
    });
    if (orderIds.length === 0) {
      throw new Error(
        "El pack no contiene órdenes disponibles para este vendedor",
      );
    }
    const orders = await Promise.all(
      orderIds.map((orderId) =>
        getMercadoLibreResource(connectionId, `/orders/${orderId}`),
      ),
    );
    return {
      referenceType: "pack" as const,
      pack: {
        id: getRequiredString(
          packRequest.payload.id,
          "el identificador del pack",
        ),
        status: getOptionalString(packRequest.payload.status),
      },
      orders: orders.map(parseMercadoLibreHistoricalOrder),
    };
  }

  const orderRequest = await requestMercadoLibreResource(
    connectionId,
    `/orders/${reference}`,
  );
  if (!orderRequest.ok || !orderRequest.payload) {
    throw new Error(
      "No se encontró una venta u orden disponible en Mercado Libre",
    );
  }
  return {
    referenceType: "order" as const,
    pack: null,
    orders: [parseMercadoLibreHistoricalOrder(orderRequest.payload)],
  };
}

async function getItemMappings(
  connectionId: string,
  storeId: string,
  items: RemoteOrderItem[],
) {
  const externalItemIds = Array.from(
    new Set(items.map((item) => item.externalItemId)),
  );
  const skus = Array.from(
    new Set(items.flatMap((item) => (item.sku ? [item.sku] : []))),
  );
  const [listings, products] = await Promise.all([
    prismadb.marketplaceListing.findMany({
      where: { connectionId, externalItemId: { in: externalItemIds } },
      select: {
        externalItemId: true,
        externalVariationId: true,
        product: { select: { id: true, name: true, sku: true, stock: true } },
      },
    }),
    skus.length > 0
      ? prismadb.product.findMany({
          where: { storeId, sku: { in: skus } },
          select: { id: true, name: true, sku: true, stock: true },
        })
      : Promise.resolve([]),
  ]);
  const productBySku = new Map(
    products.map((product) => [product.sku, product]),
  );

  return items.map((item) => {
    const linkedListing = listings.find(
      (listing) =>
        listing.externalItemId === item.externalItemId &&
        (listing.externalVariationId ?? null) === item.externalVariationId,
    );
    return {
      ...item,
      linkedProduct: linkedListing?.product ?? null,
      suggestedProduct: item.sku ? (productBySku.get(item.sku) ?? null) : null,
    };
  });
}

export async function inspectMercadoLibreHistoricalSale(
  connectionId: string,
  storeId: string,
  reference: string,
): Promise<HistoricalSaleInspection> {
  const remote = await getRemoteOrdersForReference(connectionId, reference);
  const orders = await Promise.all(
    remote.orders.map(async (order) => {
      const [items, existingOrder] = await Promise.all([
        getItemMappings(connectionId, storeId, order.items),
        prismadb.marketplaceOrder.findUnique({
          where: {
            connectionId_externalOrderId: {
              connectionId,
              externalOrderId: order.externalOrderId,
            },
          },
          select: { inventoryStatus: true },
        }),
      ]);
      return {
        externalOrderId: order.externalOrderId,
        status: order.status,
        paidAt: order.paidAt,
        totalAmount: order.totalAmount,
        currencyId: order.currencyId,
        alreadyImported: Boolean(existingOrder),
        inventoryStatus: existingOrder?.inventoryStatus ?? null,
        items,
      };
    }),
  );

  return { referenceType: remote.referenceType, pack: remote.pack, orders };
}

function getValidatedFinancialValue(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} debe ser un número mayor o igual a cero`);
  }
  return value;
}

function getProductMappings(
  items: Awaited<ReturnType<typeof getItemMappings>>,
) {
  const mappings: ProductMapping[] = [];
  for (const item of items) {
    const product = item.linkedProduct ?? item.suggestedProduct;
    if (!product) {
      throw new Error(
        `No hay un producto local vinculado al SKU ${item.sku ?? item.title}`,
      );
    }
    mappings.push({
      externalItemId: item.externalItemId,
      externalVariationId: item.externalVariationId,
      title: item.title,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      productId: product.id,
    });
  }
  return mappings;
}

export async function reconcileMercadoLibreHistoricalSale({
  connectionId,
  storeId,
  externalOrderId,
  financials,
}: {
  connectionId: string;
  storeId: string;
  externalOrderId: string;
  financials: HistoricalSaleFinancials;
}) {
  validateReference(externalOrderId);
  const rawOrder = await getMercadoLibreResource(
    connectionId,
    `/orders/${externalOrderId}`,
  );
  const order = parseMercadoLibreHistoricalOrder(rawOrder);
  if (order.status !== "paid") {
    throw new Error("Solo se pueden conciliar órdenes pagadas");
  }

  const marketplaceFee = getValidatedFinancialValue(
    financials.marketplaceFee,
    "El cargo por venta",
  );
  const shippingCost = getValidatedFinancialValue(
    financials.shippingCost,
    "El costo de envío",
  );
  const taxesAmount = getValidatedFinancialValue(
    financials.taxesAmount,
    "Los impuestos",
  );
  const netAmount =
    order.totalAmount - marketplaceFee - shippingCost - taxesAmount;
  if (netAmount < 0) {
    throw new Error("Los cargos no pueden ser mayores al total de la venta");
  }

  const mappings = getProductMappings(
    await getItemMappings(connectionId, storeId, order.items),
  );
  const quantitiesByProductId = new Map<string, number>();
  for (const mapping of mappings) {
    quantitiesByProductId.set(
      mapping.productId,
      (quantitiesByProductId.get(mapping.productId) ?? 0) + mapping.quantity,
    );
  }

  const result = await prismadb.$transaction(async (transaction) => {
    const existingOrder = await transaction.marketplaceOrder.findUnique({
      where: {
        connectionId_externalOrderId: { connectionId, externalOrderId },
      },
      select: { id: true },
    });
    if (existingOrder)
      throw new Error("La venta ya fue conciliada anteriormente");

    const productIds = Array.from(quantitiesByProductId.keys());
    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true, name: true, stock: true, acqPrice: true },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    for (const [productId, quantity] of Array.from(
      quantitiesByProductId.entries(),
    )) {
      const product = productsById.get(productId);
      if (!product || product.stock < quantity) {
        throw new Error(
          `Stock insuficiente para conciliar ${product?.name ?? productId}`,
        );
      }
    }

    const listingIdByItemKey = new Map<string, string>();
    for (const mapping of mappings) {
      const itemKey = `${mapping.externalItemId}:${mapping.externalVariationId ?? ""}`;
      if (listingIdByItemKey.has(itemKey)) continue;
      const [productListing, externalListing] = await Promise.all([
        transaction.marketplaceListing.findUnique({
          where: {
            connectionId_productId: {
              connectionId,
              productId: mapping.productId,
            },
          },
          select: { id: true, externalItemId: true },
        }),
        transaction.marketplaceListing.findFirst({
          where: {
            connectionId,
            externalItemId: mapping.externalItemId,
            externalVariationId: mapping.externalVariationId,
          },
          select: { id: true, productId: true },
        }),
      ]);
      if (
        productListing?.externalItemId &&
        productListing.externalItemId !== mapping.externalItemId
      ) {
        throw new Error(
          "Un producto local ya está vinculado a otra publicación de Mercado Libre",
        );
      }
      if (externalListing && externalListing.productId !== mapping.productId) {
        throw new Error(
          "La publicación de Mercado Libre ya está vinculada a otro producto local",
        );
      }

      const product = productsById.get(mapping.productId)!;
      const listing = externalListing
        ? { id: externalListing.id }
        : productListing
          ? await transaction.marketplaceListing.update({
              where: { id: productListing.id },
              data: {
                externalItemId: mapping.externalItemId,
                externalVariationId: mapping.externalVariationId,
                title: mapping.title,
                status: MarketplaceListingStatus.ACTIVE,
                syncStock: true,
                syncPrice: false,
              },
              select: { id: true },
            })
          : await transaction.marketplaceListing.create({
              data: {
                connectionId,
                productId: mapping.productId,
                externalItemId: mapping.externalItemId,
                externalVariationId: mapping.externalVariationId,
                title: mapping.title,
                marketplacePrice: mapping.unitPrice,
                stockSafetyBuffer: 0,
                syncStock: true,
                syncPrice: false,
                status: MarketplaceListingStatus.ACTIVE,
                lastSyncedStock:
                  product.stock - (quantitiesByProductId.get(product.id) ?? 0),
                lastSyncedPrice: mapping.unitPrice,
                lastRemoteUpdateAt: new Date(),
                metadata: {
                  historicalReconciliation: true,
                  attributes: [],
                },
              },
              select: { id: true },
            });
      listingIdByItemKey.set(itemKey, listing.id);
    }

    for (const [productId, quantity] of Array.from(
      quantitiesByProductId.entries(),
    )) {
      const stockUpdate = await transaction.product.updateMany({
        where: { id: productId, storeId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (stockUpdate.count !== 1) {
        throw new Error("El stock cambió antes de terminar la conciliación");
      }
    }

    const marketplaceOrder = await transaction.marketplaceOrder.create({
      data: {
        connectionId,
        externalOrderId,
        externalPackId: order.externalPackId,
        status: MarketplaceOrderStatus.PAID,
        inventoryStatus: MarketplaceInventoryStatus.DECREMENTED,
        paidAt: order.paidAt ?? new Date(),
        totalAmount: order.totalAmount,
        currencyId: order.currencyId ?? "COP",
        marketplaceFee,
        shippingCost,
        netAmount,
        lastRemoteUpdateAt: new Date(),
        inventoryAppliedAt: new Date(),
        metadata: {
          source: "HISTORICAL_RECONCILIATION",
          taxesAmount,
        } as Prisma.InputJsonValue,
        items: {
          create: mappings.map((mapping) => ({
            listingId:
              listingIdByItemKey.get(
                `${mapping.externalItemId}:${mapping.externalVariationId ?? ""}`,
              ) ?? null,
            productId: mapping.productId,
            externalItemId: mapping.externalItemId,
            externalVariationId: mapping.externalVariationId,
            title: mapping.title,
            sku: mapping.sku,
            quantity: mapping.quantity,
            unitPrice: mapping.unitPrice,
          })),
        },
      },
      select: { id: true },
    });

    const runningStockByProductId = new Map(
      products.map((product) => [product.id, product.stock]),
    );
    for (const mapping of mappings) {
      const previousStock = runningStockByProductId.get(mapping.productId) ?? 0;
      const newStock = previousStock - mapping.quantity;
      runningStockByProductId.set(mapping.productId, newStock);
      await transaction.inventoryMovement.create({
        data: {
          storeId,
          productId: mapping.productId,
          type: InventoryMovementType.ORDER_PLACED,
          quantity: -mapping.quantity,
          previousStock,
          newStock,
          reason: `Mercado Libre: conciliación histórica de venta confirmada ${externalOrderId}`,
          referenceId: marketplaceOrder.id,
          cost: productsById.get(mapping.productId)?.acqPrice ?? null,
          price: mapping.unitPrice,
          createdBy: "SYSTEM_MERCADOLIBRE",
        },
      });
    }

    const parentKits = await transaction.productKit.findMany({
      where: { componentId: { in: productIds } },
      select: { kitId: true },
    });
    await recalculateKitStock(
      transaction,
      Array.from(new Set(parentKits.map((kit) => kit.kitId))),
    );
    await queueMarketplaceStockSyncEvents(transaction, productIds);
    return marketplaceOrder.id;
  });

  let queuedStockEvents = 0;
  try {
    queuedStockEvents =
      await enqueuePendingMarketplaceOutboxEvents(connectionId);
  } catch (error) {
    console.error("Mercado Libre historical sale stock dispatch deferred", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  return { marketplaceOrderId: result, netAmount, queuedStockEvents };
}
