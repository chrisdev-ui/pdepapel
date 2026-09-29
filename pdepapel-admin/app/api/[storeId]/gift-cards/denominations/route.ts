import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import {
  getActiveDenominations,
  parseDenominationAmount,
} from "@/lib/gift-cards";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Valores de tarjeta de regalo a la venta.
 *
 * GET es público (la tienda lo pinta en /tarjeta-regalo); POST agrega un
 * valor y solo puede la dueña. La lista completa con inactivos la lee el
 * panel por `?all=1` con sesión.
 */
const getCorsHeaders = (request: Request) => ({
  ...createCorsHeaders(request, { methods: "GET, POST, OPTIONS" }),
  ...CACHE_HEADERS.NO_CACHE,
});

export async function OPTIONS(req: Request) {
  return NextResponse.json({}, { headers: getCorsHeaders(req) });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const headers = getCorsHeaders(req);
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const url = new URL(req.url);
    if (url.searchParams.get("all") === "1") {
      const { userId } = await auth();
      if (!userId) throw ErrorFactory.Unauthenticated();
      await verifyStoreOwner(userId, params.storeId);
      const rows = await prismadb.giftCardDenomination.findMany({
        where: { storeId: params.storeId },
        orderBy: [{ sortOrder: "asc" }, { amount: "asc" }],
      });
      return NextResponse.json({ rows }, { headers });
    }
    const denominations = await getActiveDenominations(prismadb, params.storeId);
    return NextResponse.json({ denominations }, { headers });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_DENOMINATIONS_GET", { headers });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const headers = getCorsHeaders(req);
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => null);
    const amount = parseDenominationAmount(body?.amount);
    const existing = await prismadb.giftCardDenomination.findUnique({
      where: { storeId_amount: { storeId: params.storeId, amount } },
    });
    if (existing) {
      throw ErrorFactory.Conflict("Ese valor ya está en la lista");
    }
    const count = await prismadb.giftCardDenomination.count({
      where: { storeId: params.storeId },
    });
    const row = await prismadb.giftCardDenomination.create({
      data: { storeId: params.storeId, amount, isActive: true, sortOrder: count },
    });
    return NextResponse.json(row, { headers });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_DENOMINATIONS_POST", { headers, expectedStatusCodes: [409] });
  }
}
