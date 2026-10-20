import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { createCapsuleEdition, listCapsuleEditions } from "@/lib/capsule-editions";
import { withIdempotency } from "@/lib/idempotency";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Ediciones de cápsulas. Solo la dueña: llevan costos y la banda de la edición. */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json({ editions: await listCapsuleEditions(params.storeId) }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_EDITIONS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return await withIdempotency(req, params.storeId, async () => {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") throw ErrorFactory.InvalidRequest("Datos de la edición inválidos");
      const edition = await createCapsuleEdition({
        storeId: params.storeId,
        productId: String(body.productId ?? ""),
        name: body.name,
        theme: body.theme,
        costBandMin: Number(body.costBandMin),
        costBandMax: Number(body.costBandMax),
        dailyOrderCap: body.dailyOrderCap === undefined ? undefined : Number(body.dailyOrderCap),
        userId,
      });
      // El producto quedó archivado: la tienda deja de mostrarlo (purga después de responder).
      runInBackground("cápsulas: purga del producto de la edición", () => invalidateStoreProductsCache(params.storeId, { productIds: [edition.productId] }));
      return NextResponse.json({ edition }, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
    }, CACHE_HEADERS.NO_CACHE);
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_EDITIONS_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
