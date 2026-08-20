import {
  MarketplaceListingStatus,
  MarketplaceOrderStatus,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";

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
    | "claim";
  title: string;
  detail: string;
  listingId?: string;
  orderId?: string;
};

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
  const [listings, questions, shipments, claims, paidOrders] =
    await Promise.all([
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
                is: { status: { not: MarketplaceOrderStatus.CANCELLED } },
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
              status: MarketplaceOrderStatus.PAID,
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
      });
    }
  }

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
