import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getCapsuleEdition, updateCapsuleEdition } from "@/lib/capsule-editions";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type Params = { params: { storeId: string; editionId: string } };

export async function GET(_req: Request, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(await getCapsuleEdition(params.storeId, params.editionId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_EDITION_GET", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404] });
  }
}

/** Nombre, tema, banda (antes de imprimir), tope diario o estado (DRAFT ↔ PREVIEW, CLOSED). */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw ErrorFactory.InvalidRequest("Datos de la edición inválidos");
    const edition = await updateCapsuleEdition({ storeId: params.storeId, editionId: params.editionId, userId, ...body });
    return NextResponse.json({ edition }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_EDITION_PATCH", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
