import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { checkPoolMargins } from "@/lib/capsule-pool";
import { parsePackOptions } from "@/lib/capsule-pack-options";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { requireJsonBody } from "@/lib/request-body";

/** Calcula, sin escribir nada, el margen de cada pack con la bolsa propuesta. POST porque recibe una lista. */
export async function POST(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await requireJsonBody(req, "CAPSULE_MARGIN_CHECK");
    if (!body || typeof body !== "object") throw ErrorFactory.InvalidRequest("Datos inválidos");
    const check = await checkPoolMargins({
      storeId: params.storeId,
      editionId: params.editionId,
      proposed: Array.isArray(body.pool) ? body.pool.map((line: { productId?: unknown; quantity?: unknown }) => ({ productId: String(line.productId ?? ""), quantity: Number(line.quantity) })) : [],
      packOptions: body.packOptions === undefined ? undefined : parsePackOptions(body.packOptions),
    });
    return NextResponse.json(check, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_MARGIN_CHECK", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404] });
  }
}
