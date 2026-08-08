import { auth } from "@clerk/nextjs";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

function getPositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export async function GET(
  request: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const url = new URL(request.url);
    const page = getPositiveInteger(url.searchParams.get("page"), 1, 10_000);
    const pageSize = getPositiveInteger(
      url.searchParams.get("pageSize"),
      10,
      50,
    );
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
        { data: [], page, pageSize, total: 0, pageCount: 0 },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const [data, total] = await Promise.all([
      prismadb.marketplaceOrder.findMany({
        where: { connectionId: connection.id },
        orderBy: { paidAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          externalOrderId: true,
          externalPackId: true,
          status: true,
          inventoryStatus: true,
          paidAt: true,
          totalAmount: true,
          marketplaceFee: true,
          shippingCost: true,
          netAmount: true,
          metadata: true,
          items: {
            select: {
              title: true,
              quantity: true,
              unitPrice: true,
              product: { select: { name: true, sku: true } },
            },
          },
        },
      }),
      prismadb.marketplaceOrder.count({
        where: { connectionId: connection.id },
      }),
    ]);

    return NextResponse.json(
      {
        data,
        page,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize),
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_HISTORICAL_SALES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
