import { auth } from "@clerk/nextjs/server";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Ventas de Mercado Libre registradas (sincronizadas o importadas). La lista
 * pagina y busca en el cliente (DataTable), así que se entregan las últimas
 * `limit` ventas de una vez; `?order=<id>` añade esa venta aunque quede fuera
 * del límite, para que el enlace del correo siempre la encuentre.
 */
const DEFAULT_LIMIT = 300;
const MAX_LIMIT = 1000;

const SALE_SELECT = {
  id: true,
  externalOrderId: true,
  externalPackId: true,
  status: true,
  inventoryStatus: true,
  inventoryError: true,
  buyerName: true,
  paidAt: true,
  createdAt: true,
  totalAmount: true,
  marketplaceFee: true,
  shippingCost: true,
  netAmount: true,
  refundedAmount: true,
  metadata: true,
  items: {
    select: {
      title: true,
      quantity: true,
      unitPrice: true,
      product: { select: { name: true, sku: true } },
    },
  },
} as const;

type MetadataShape = {
  source?: unknown;
  taxesAmount?: unknown;
  financials?: { moneyReleaseStatus?: unknown } | null;
  refund?: { reason?: unknown } | null;
};

function serializeSale(sale: {
  metadata: unknown;
  [key: string]: unknown;
}) {
  const metadata =
    sale.metadata && typeof sale.metadata === "object" && !Array.isArray(sale.metadata)
      ? (sale.metadata as MetadataShape)
      : {};
  const taxes = Number(metadata.taxesAmount);
  const release = metadata.financials?.moneyReleaseStatus;
  const refundReason = metadata.refund?.reason;
  const { metadata: _metadata, ...rest } = sale;
  return {
    ...rest,
    historical: metadata.source === "HISTORICAL_RECONCILIATION",
    taxesAmount: Number.isFinite(taxes) ? taxes : null,
    moneyReleaseStatus: typeof release === "string" ? release : null,
    refundReason: typeof refundReason === "string" ? refundReason : null,
  };
}

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const url = new URL(request.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    );
    const linkedId = url.searchParams.get("order")?.trim() || null;

    const connection = await prismadb.marketplaceConnection.findUnique({
      where: {
        storeId_provider: {
          storeId: params.storeId,
          provider: MarketplaceProvider.MERCADOLIBRE,
        },
      },
      select: { id: true },
    });
    if (!connection) {
      return NextResponse.json(
        { data: [], total: 0, linkedSale: null },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const [sales, total, linked] = await Promise.all([
      prismadb.marketplaceOrder.findMany({
        where: { connectionId: connection.id },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        take: limit,
        select: SALE_SELECT,
      }),
      prismadb.marketplaceOrder.count({
        where: { connectionId: connection.id },
      }),
      linkedId
        ? prismadb.marketplaceOrder.findFirst({
            where: { id: linkedId, connectionId: connection.id },
            select: SALE_SELECT,
          })
        : null,
    ]);

    return NextResponse.json(
      {
        data: sales.map(serializeSale),
        total,
        linkedSale: linked ? serializeSale(linked) : null,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_HISTORICAL_SALES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
