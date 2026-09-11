import {
  MarketplaceInventoryStatus,
  MarketplaceListingStatus,
  MarketplaceOrderStatus,
  MarketplaceOutboxStatus,
  MarketplaceWebhookEventStatus,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import {
  RETURN_MARKETPLACE_ORDER_STATUSES,
  REVENUE_MARKETPLACE_ORDER_STATUSES,
} from "./order-status";

import { getMercadoLibreListingImageUrls } from "./listing-metadata";
import { getMarketplaceOrderNetProfit } from "./reporting";

export type MercadoLibreHealthIssue = {
  kind:
    | "listing_error"
    | "listing_incomplete"
    | "stock_risk"
    | "margin_risk"
    | "question"
    | "shipment"
    | "claim"
    /** Venta pagada cuyo inventario local no se pudo aplicar o devolver. */
    | "inventory_exception"
    /** Envío de precio/stock/contenido a Mercado Libre que agotó sus reintentos. */
    | "outbox_failed"
    /** Aviso de Mercado Libre que no se pudo procesar tras los reintentos. */
    | "webhook_failed"
    /** Venta pagada que sigue sin liquidación pasados SETTLEMENT_PENDING_DAYS. */
    | "settlement_pending";
  title: string;
  detail: string;
  listingId?: string;
  orderId?: string;
  /** Local product behind a listing issue, for "adjust stock" style actions. */
  productId?: string;
  /** Public Mercado Libre URL of the listing, when it has been published. */
  permalink?: string | null;
  /** Número de venta en Mercado Libre, para las acciones que lo necesitan (reprocesar). */
  externalOrderId?: string;
};

/**
 * Mercado Libre libera el dinero unos días después de la entrega; una venta
 * pagada que sigue sin neto una semana después ya no es "todavía no": alguien
 * tiene que revisar la liquidación o refrescar el flujo de caja.
 */
export const SETTLEMENT_PENDING_DAYS = 7;

export type MercadoLibreHealthSummary = {
  totalListings: number;
  activeListings: number;
  unansweredQuestions: number;
  shipmentsToDispatch: number;
  claimsRequiringAttention: number;
  grossSales: number;
  netSales: number;
  marketplaceCosts: number;
  netProfit: number;
  issues: MercadoLibreHealthIssue[];
};

const MAX_HEALTH_ISSUES = 20;

export async function getMercadoLibreHealthSummary(
  connectionId: string,
  options: { includeFinancials?: boolean } = {},
) {
  const includeFinancials = options.includeFinancials ?? true;
  const settlementCutoff = new Date(
    Date.now() - SETTLEMENT_PENDING_DAYS * 24 * 60 * 60 * 1000,
  );
  const [
    listings,
    questions,
    shipments,
    claims,
    paidOrders,
    inventoryExceptions,
    failedOutbox,
    failedWebhooks,
    settlementPending,
  ] = await Promise.all([
      prismadb.marketplaceListing.findMany({
        where: { connectionId },
        select: {
          id: true,
          title: true,
          categoryId: true,
          marketplacePrice: true,
          minimumMarginAmount: true,
          status: true,
          lastError: true,
          stockSafetyBuffer: true,
          productId: true,
          externalPermalink: true,
          metadata: true,
          product: {
            select: {
              name: true,
              stock: true,
              acqPrice: true,
              images: { select: { url: true } },
            },
          },
        },
        orderBy: { updatedAt: "desc" },
      }),
      prismadb.marketplaceQuestion.findMany({
        where: {
          connectionId,
          status: { in: ["UNANSWERED", "PENDING"] },
        },
        select: {
          id: true,
          question: true,
          listingId: true,
          product: { select: { name: true } },
        },
        orderBy: { askedAt: "asc" },
        take: MAX_HEALTH_ISSUES,
      }),
      prismadb.marketplaceShipment.findMany({
        where: {
          connectionId,
          status: { in: ["ready_to_ship", "handling"] },
          OR: [
            { marketplaceOrderId: null },
            {
              marketplaceOrder: {
                is: {
                  status: { notIn: [...RETURN_MARKETPLACE_ORDER_STATUSES] },
                },
              },
            },
          ],
        },
        select: {
          id: true,
          externalShipmentId: true,
          marketplaceOrderId: true,
          marketplaceOrder: { select: { externalOrderId: true } },
        },
        orderBy: { updatedAt: "asc" },
        take: MAX_HEALTH_ISSUES,
      }),
      prismadb.marketplaceClaim.findMany({
        where: { connectionId, status: { notIn: ["closed", "resolved"] } },
        select: {
          id: true,
          title: true,
          status: true,
          marketplaceOrderId: true,
        },
        orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
        take: MAX_HEALTH_ISSUES,
      }),
      includeFinancials
        ? prismadb.marketplaceOrder.findMany({
            where: {
              connectionId,
              status: { in: [...REVENUE_MARKETPLACE_ORDER_STATUSES] },
              netAmount: { not: null },
            },
            select: {
              totalAmount: true,
              netAmount: true,
              marketplaceFee: true,
              shippingCost: true,
              paidAt: true,
              createdAt: true,
              items: {
                select: {
                  quantity: true,
                  unitPrice: true,
                  product: { select: { acqPrice: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      prismadb.marketplaceOrder.findMany({
        where: {
          connectionId,
          inventoryStatus: {
            in: [
              MarketplaceInventoryStatus.EXCEPTION,
              MarketplaceInventoryStatus.RESTOCK_PENDING,
            ],
          },
        },
        select: {
          id: true,
          externalOrderId: true,
          inventoryStatus: true,
          inventoryError: true,
        },
        orderBy: { updatedAt: "desc" },
        take: MAX_HEALTH_ISSUES,
      }),
      prismadb.marketplaceOutboxEvent.findMany({
        where: { connectionId, status: MarketplaceOutboxStatus.FAILED },
        select: {
          id: true,
          action: true,
          lastError: true,
          listingId: true,
          productId: true,
          listing: { select: { title: true, externalPermalink: true } },
          product: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: MAX_HEALTH_ISSUES,
      }),
      prismadb.marketplaceWebhookEvent.count({
        where: { connectionId, status: MarketplaceWebhookEventStatus.FAILED },
      }),
      prismadb.marketplaceOrder.findMany({
        where: {
          connectionId,
          status: { in: [...REVENUE_MARKETPLACE_ORDER_STATUSES] },
          netAmount: null,
          paidAt: { lt: settlementCutoff },
        },
        select: { id: true, externalOrderId: true, paidAt: true },
        orderBy: { paidAt: "asc" },
        take: MAX_HEALTH_ISSUES,
      }),
    ]);

  const issues: MercadoLibreHealthIssue[] = [];
  for (const listing of listings) {
    const title = listing.title ?? listing.product.name;
    const imageUrls = getMercadoLibreListingImageUrls(
      listing.product.images,
      listing.metadata,
    );
    if (
      listing.status === MarketplaceListingStatus.ERROR ||
      listing.lastError
    ) {
      issues.push({
        kind: "listing_error",
        title,
        detail: listing.lastError ?? "La publicación necesita revisión manual.",
        listingId: listing.id,
        productId: listing.productId,
        permalink: listing.externalPermalink,
      });
    }
    if (
      !listing.categoryId ||
      imageUrls.length === 0 ||
      !listing.marketplacePrice
    ) {
      issues.push({
        kind: "listing_incomplete",
        title,
        detail:
          "Falta categoría, precio o al menos una foto para publicar correctamente.",
        listingId: listing.id,
        productId: listing.productId,
        permalink: listing.externalPermalink,
      });
    }
    if (
      listing.status === MarketplaceListingStatus.ACTIVE &&
      listing.product.stock <= listing.stockSafetyBuffer
    ) {
      issues.push({
        kind: "stock_risk",
        title,
        detail: `Stock local ${listing.product.stock}; el colchón de seguridad es ${listing.stockSafetyBuffer}.`,
        listingId: listing.id,
        productId: listing.productId,
        permalink: listing.externalPermalink,
      });
    }
    if (
      listing.minimumMarginAmount !== null &&
      listing.marketplacePrice !== null &&
      listing.marketplacePrice - Number(listing.product.acqPrice ?? 0) <
        listing.minimumMarginAmount
    ) {
      issues.push({
        kind: "margin_risk",
        title,
        detail:
          "El precio no cubre el margen mínimo incluso antes de comisión, envío e impuestos.",
        listingId: listing.id,
        productId: listing.productId,
        permalink: listing.externalPermalink,
      });
    }
  }

  // Estados que cambian bien en la base y antes no se veían en ningún sitio.
  issues.push(
    ...inventoryExceptions.map((order) => ({
      kind: "inventory_exception" as const,
      title: `Venta ${order.externalOrderId} sin inventario aplicado`,
      detail:
        order.inventoryError ??
        (order.inventoryStatus === MarketplaceInventoryStatus.RESTOCK_PENDING
          ? "La devolución de inventario quedó pendiente."
          : "El inventario local no se pudo descontar."),
      orderId: order.id,
      externalOrderId: order.externalOrderId,
    })),
    ...failedOutbox.map((event) => ({
      kind: "outbox_failed" as const,
      title: `${event.listing?.title ?? event.product?.name ?? "Publicación"} · ${describeOutboxAction(event.action)}`,
      detail:
        event.lastError ??
        "Mercado Libre no aceptó el cambio y se agotaron los reintentos; la publicación puede estar desactualizada.",
      listingId: event.listingId ?? undefined,
      productId: event.productId ?? undefined,
      permalink: event.listing?.externalPermalink ?? null,
    })),
    ...(failedWebhooks > 0
      ? [
          {
            kind: "webhook_failed" as const,
            title: `${failedWebhooks} ${failedWebhooks === 1 ? "aviso de Mercado Libre sin procesar" : "avisos de Mercado Libre sin procesar"}`,
            detail:
              "Llegaron notificaciones (ventas, preguntas, envíos) que no se pudieron aplicar tras los reintentos. Ejecuta la recuperación de la cola.",
          },
        ]
      : []),
    ...settlementPending.map((order) => ({
      kind: "settlement_pending" as const,
      title: `Venta ${order.externalOrderId} sin liquidación`,
      detail: `Pagada ${describeDaysAgo(order.paidAt)} y Mercado Libre aún no reporta el neto. Refresca el flujo de caja o revísala en la cuenta.`,
      orderId: order.id,
      externalOrderId: order.externalOrderId,
    })),
  );

  issues.push(
    ...questions.map((question) => ({
      kind: "question" as const,
      title: question.product?.name ?? "Pregunta de Mercado Libre",
      detail: question.question,
      listingId: question.listingId ?? undefined,
    })),
    ...shipments.map((shipment) => ({
      kind: "shipment" as const,
      title: `Envío ${shipment.externalShipmentId}`,
      detail: shipment.marketplaceOrder
        ? `Pedido ${shipment.marketplaceOrder.externalOrderId} listo para despachar.`
        : "Este envío está listo para despachar.",
      orderId: shipment.marketplaceOrderId ?? undefined,
    })),
    ...claims.map((claim) => ({
      kind: "claim" as const,
      title: claim.title ?? "Reclamo de Mercado Libre",
      detail: `Estado: ${claim.status}. Revisa el caso en Mercado Libre antes de tomar una decisión.`,
      orderId: claim.marketplaceOrderId ?? undefined,
    })),
  );

  const grossSales = paidOrders.reduce(
    (total, order) => total + Number(order.totalAmount ?? 0),
    0,
  );
  const netSales = paidOrders.reduce(
    (total, order) => total + Number(order.netAmount ?? 0),
    0,
  );
  const marketplaceCosts = paidOrders.reduce(
    (total, order) =>
      total +
      Number(order.marketplaceFee ?? 0) +
      Number(order.shippingCost ?? 0),
    0,
  );
  const netProfit = paidOrders.reduce(
    (total, order) => total + getMarketplaceOrderNetProfit(order),
    0,
  );

  return {
    totalListings: listings.length,
    activeListings: listings.filter(
      (listing) => listing.status === MarketplaceListingStatus.ACTIVE,
    ).length,
    unansweredQuestions: questions.length,
    shipmentsToDispatch: shipments.length,
    claimsRequiringAttention: claims.length,
    grossSales,
    netSales,
    marketplaceCosts,
    netProfit,
    issues: issues.slice(0, MAX_HEALTH_ISSUES),
  } satisfies MercadoLibreHealthSummary;
}

function describeOutboxAction(action: string): string {
  switch (action) {
    case "SYNC_STOCK":
      return "stock sin sincronizar";
    case "SYNC_PRICE":
      return "precio sin sincronizar";
    case "SYNC_LISTING_CONTENT":
      return "contenido sin sincronizar";
    case "SYNC_LISTING_STATUS":
    case "PAUSE_LISTING":
    case "ACTIVATE_LISTING":
      return "estado sin sincronizar";
    case "PUBLISH_LISTING":
      return "publicación sin enviar";
    case "SYNC_ORDER_FINANCIALS":
      return "liquidación sin actualizar";
    default:
      return `tarea ${action.toLowerCase().replace(/_/g, " ")} sin completar`;
  }
}

function describeDaysAgo(date: Date | null): string {
  if (!date) return "hace días";
  const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  return days <= 1 ? "hace 1 día" : `hace ${days} días`;
}
