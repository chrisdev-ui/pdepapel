import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { voidCapsuleSlips } from "@/lib/capsule-slips";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { requireJsonBody } from "@/lib/request-body";

/** Anula papeles o regalos impresos (libera el apartado). `slipIds` vacío no anula nada: cerrar la edición es lo que anula todo. Solo la dueña. */
export async function POST(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await requireJsonBody(req, "CAPSULE_SLIPS_VOID");
    const slipIds: string[] = Array.isArray(body?.slipIds) ? body.slipIds.map(String).filter(Boolean) : [];
    if (slipIds.length === 0) throw ErrorFactory.InvalidRequest("Elige los papeles que vas a anular");
    const products = await prismadb.capsuleSlip.findMany({ where: { id: { in: slipIds }, storeId: params.storeId }, select: { productId: true } });
    const result = await voidCapsuleSlips({ storeId: params.storeId, editionId: params.editionId, slipIds, userId });
    const productIds = Array.from(new Set(products.map((row) => row.productId)));
    runInBackground("cápsulas: purga tras anular", () => invalidateStoreProductsCache(params.storeId, { productIds }));
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SLIPS_VOID", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
