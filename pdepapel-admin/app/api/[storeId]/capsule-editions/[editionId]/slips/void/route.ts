import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { voidCapsuleSlips } from "@/lib/capsule-slips";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Anula papeles o regalos impresos (libera el apartado). `slipIds` vacío no anula nada: cerrar la edición es lo que anula todo. Solo la dueña. */
export async function POST(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await req.json().catch(() => null);
    const slipIds: string[] = Array.isArray(body?.slipIds) ? body.slipIds.map(String).filter(Boolean) : [];
    if (slipIds.length === 0) throw ErrorFactory.InvalidRequest("Elige los papeles que vas a anular");
    const products = await prismadb.capsuleSlip.findMany({ where: { id: { in: slipIds }, storeId: params.storeId }, select: { productId: true } });
    const result = await voidCapsuleSlips({ storeId: params.storeId, editionId: params.editionId, slipIds, userId });
    await invalidateStoreProductsCache(params.storeId, { productIds: Array.from(new Set(products.map((row) => row.productId))) });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SLIPS_VOID", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
