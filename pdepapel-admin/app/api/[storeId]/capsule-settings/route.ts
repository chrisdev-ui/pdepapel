import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getCapsuleSettings, saveCapsuleSettings } from "@/lib/capsule-settings";
import { readJsonBody } from "@/lib/request-body";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Piso de costo de un papel y plantilla de packs de las ediciones sugeridas. Solo la dueña: son costos. */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(await getCapsuleSettings(params.storeId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SETTINGS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function PUT(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const read = await readJsonBody(req, "CAPSULE_SETTINGS_PUT");
    // Sin cuerpo legible no se guarda nada: antes un cuerpo vacío dejaba los dos mínimos en blanco.
    if (!read.ok || typeof read.body !== "object" || read.body === null || Array.isArray(read.body)) {
      throw ErrorFactory.InvalidRequest("No llegaron los ajustes de cápsulas. Vuelve a intentarlo.");
    }
    return NextResponse.json(await saveCapsuleSettings(params.storeId, read.body as Record<string, unknown>), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SETTINGS_PUT", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400] });
  }
}
