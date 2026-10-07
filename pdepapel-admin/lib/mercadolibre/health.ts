import {
  type Prisma,
  MarketplaceInventoryStatus,
  MarketplaceListingStatus,
  MarketplaceOrderStatus,
  MarketplaceOutboxStatus,
  MarketplaceWebhookEventStatus,
} from "@prisma/client";

import { getUnitCostFloor } from "@/lib/product-costs";
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
  /** Stock local de la alerta de stock: si cambia, la alerta es otra (health-alerts.ts). */
  stock?: number;
  /** Id de la fila de origen (pregunta, envío, reclamo, tarea de la cola) para identificar la alerta. */
  entityId?: string;
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

/**
 * Reglas de cada alerta de publicación, aparte para probarlas sin base.
 *
 * El 2026-10-07 el aviso diario repetía seis alertas que Paula no podía
 * quitar de ninguna forma (#8): cuatro «stock en riesgo» de publicaciones
 * que Mercado Libre ya había pausado sola al llegar a cero, una «incompleta»
 * de una publicación pausada de un producto archivado y una «venta sin
 * inventario» de una venta que Mercado Libre canceló. Ninguna pedía nada.
 */
type ListingForRules = {
  status: MarketplaceListingStatus;
  stockSafetyBuffer: number;
  lastSyncedStock: number | null;
  product: { stock: number; isArchived: boolean };
};

/** Estados en los que completar o corregir la publicación sirve para algo. */
const WORKABLE_LISTING_STATUSES: MarketplaceListingStatus[] = [
  MarketplaceListingStatus.DRAFT,
  MarketplaceListingStatus.ACTIVE,
  MarketplaceListingStatus.ERROR,
];

/**
 * Una publicación pausada, cerrada o desvinculada, o de un producto
 * archivado (descontinuado), no se va a publicar: pedir que se complete o
 * que se revise su margen es ruido.
 */
export function isWorkableListing(listing: ListingForRules): boolean {
  return (
    WORKABLE_LISTING_STATUSES.includes(listing.status) &&
    !listing.product.isArchived
  );
}

/**
 * Stock en riesgo: solo cuando todavía hay algo que hacer.
 * - Producto archivado: no se repone; no es riesgo.
 * - Stock en cero que ya llegó a Mercado Libre (`lastSyncedStock` 0): allá
 *   la publicación quedó sin unidades y Mercado Libre la pausa sola.
 * - Sí avisa si hay unidades escondidas por el colchón (0 < stock ≤ colchón)
 *   o si el cero todavía no se ha enviado.
 */
export function isStockAtRisk(listing: ListingForRules): boolean {
  if (listing.status !== MarketplaceListingStatus.ACTIVE) return false;
  if (listing.product.isArchived) return false;
  if (listing.product.stock > listing.stockSafetyBuffer) return false;
  if (listing.product.stock > 0) return true;
  return listing.lastSyncedStock === null || listing.lastSyncedStock > 0;
}

/**
 * Venta con el inventario por resolver. EXCEPTION solo importa si la venta
 * cuenta como ingreso (hay que descontar unidades); RESTOCK_PENDING solo si
 * se canceló o se reembolsó (hay que confirmar el retorno). Una venta
 * cancelada que nunca descontó nada no tiene nada que resolver.
 */
export function inventoryExceptionWhere(connectionId: string) {
  return {
    connectionId,
    OR: [
      {
        inventoryStatus: MarketplaceInventoryStatus.EXCEPTION,
        status: { in: [...REVENUE_MARKETPLACE_ORDER_STATUSES] },
      },
      {
        inventoryStatus: MarketplaceInventoryStatus.RESTOCK_PENDING,
        status: { in: [...RETURN_MARKETPLACE_ORDER_STATUSES] },
      },
    ],
  } satisfies Prisma.MarketplaceOrderWhereInput;
}

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
          lastSyncedStock: true,
          productId: true,
          externalPermalink: true,
          metadata: true,
          product: {
            select: {
              name: true,
              stock: true,
              isArchived: true,
              acqPrice: true,
              transportationCost: true,
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
                  product: { select: { acqPrice: true, transportationCost: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      prismadb.marketplaceOrder.findMany({
        where: inventoryExceptionWhere(connectionId),
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
    const workable = isWorkableListing(listing);
    if (
      workable &&
      (listing.status === MarketplaceListingStatus.ERROR || listing.lastError)
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
      workable &&
      (!listing.categoryId || imageUrls.length === 0 || !listing.marketplacePrice)
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
    if (isStockAtRisk(listing)) {
      issues.push({
        kind: "stock_risk",
        title,
        detail:
          listing.product.stock > 0
            ? `Quedan ${listing.product.stock} en la tienda y el colchón de seguridad es ${listing.stockSafetyBuffer}: Mercado Libre no muestra ninguna. Repón o baja el colchón.`
            : "Se acabó en la tienda y el cero todavía no llegó a Mercado Libre. Sincroniza el stock o pausa la publicación.",
        stock: listing.product.stock,
        listingId: listing.id,
        productId: listing.productId,
        permalink: listing.externalPermalink,
      });
    }
    if (
      workable &&
      listing.minimumMarginAmount !== null &&
      listing.marketplacePrice !== null &&
      listing.marketplacePrice -
        (getUnitCostFloor(listing.product) ?? 0) <
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
      entityId: event.id,
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
      entityId: question.id,
      title: question.product?.name ?? "Pregunta de Mercado Libre",
      detail: question.question,
      listingId: question.listingId ?? undefined,
    })),
    ...shipments.map((shipment) => ({
      kind: "shipment" as const,
      entityId: shipment.id,
      title: `Envío ${shipment.externalShipmentId}`,
      detail: shipment.marketplaceOrder
        ? `Pedido ${shipment.marketplaceOrder.externalOrderId} listo para despachar.`
        : "Este envío está listo para despachar.",
      orderId: shipment.marketplaceOrderId ?? undefined,
    })),
    ...claims.map((claim) => ({
      kind: "claim" as const,
      entityId: claim.id,
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
    // Sin recortar: el estado de cada alerta (health-alerts.ts) da por
    // resuelta la que no aparece, y una lista cortada la daría por resuelta
    // sin estarlo. Cada consulta ya trae como mucho MAX_HEALTH_ISSUES.
    issues,
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
