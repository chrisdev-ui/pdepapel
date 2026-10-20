import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { savePackOptions } from "@/lib/capsule-pack-options";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Guarda regalo y caja de cada pack, solo si el P95 de cada pack que cabe llega al margen mínimo. Solo la dueña. */
export async function PUT(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw ErrorFactory.InvalidRequest("Datos de los packs inválidos");
    const saved = await savePackOptions({
      storeId: params.storeId,
      editionId: params.editionId,
      options: body.options,
      proposed: Array.isArray(body.pool) ? body.pool.map((line: { productId?: unknown; quantity?: unknown }) => ({ productId: String(line.productId ?? ""), quantity: Number(line.quantity) })) : [],
    });
    return NextResponse.json(saved, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_PACK_OPTIONS_PUT", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
