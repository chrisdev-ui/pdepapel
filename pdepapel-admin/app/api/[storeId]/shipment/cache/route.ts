import { auth } from "@clerk/nextjs";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { NextResponse } from "next/server";
import { CACHE_HEADERS } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const stats = await prismadb.shippingQuote.aggregate({
      where: { storeId: params.storeId },
      _count: true,
      _sum: { hitCount: true },
    });

    const expired = await prismadb.shippingQuote.count({
      where: {
        storeId: params.storeId,
        expiresAt: { lt: new Date() },
      },
    });

    const topRoutes = await prismadb.shippingQuote.findMany({
      where: { storeId: params.storeId },
      orderBy: { hitCount: "desc" },
      take: 10,
      select: {
        originDaneCode: true,
        destDaneCode: true,
        hitCount: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        totalQuotes: stats._count,
        totalHits: stats._sum.hitCount || 0,
        expired,
        topRoutes,
      },
      {
        headers: CACHE_HEADERS.NO_CACHE,
      },
    );
  } catch (error: any) {
    return handleErrorResponse(error, "GET_SHIPPING_QUOTE_STATS", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "expired";

    if (type === "all") {
      // Limpiar todo el caché de la tienda
      const result = await prismadb.shippingQuote.deleteMany({
        where: { storeId: params.storeId },
      });
      return NextResponse.json(
        {
          message: `${result.count} cotizaciones eliminadas`,
        },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    } else if (type === "expired") {
      // Solo limpiar expiradas
      const result = await prismadb.shippingQuote.deleteMany({
        where: {
          storeId: params.storeId,
          expiresAt: { lt: new Date() },
        },
      });
      return NextResponse.json(
        {
          message: `${result.count} cotizaciones expiradas eliminadas`,
        },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    } else if (type === "unused") {
      // Limpiar las que nunca se usaron
      const result = await prismadb.shippingQuote.deleteMany({
        where: {
          storeId: params.storeId,
          hitCount: 0,
          createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });
      return NextResponse.json(
        {
          message: `${result.count} cotizaciones sin uso eliminadas`,
        },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    return NextResponse.json(
      { message: "Tipo de limpieza no válido" },
      { status: 400, headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CLEAR_SHIPPING_QUOTE_CACHE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
