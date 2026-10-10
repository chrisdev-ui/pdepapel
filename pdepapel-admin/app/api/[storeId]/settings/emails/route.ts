import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireStoreOwner } from "@/lib/store-access";
import {
  getStoreEmailSettings,
  saveStoreEmailSettings,
  storeEmailSettingsInputSchema,
} from "@/lib/store-email-settings";
import { CACHE_HEADERS } from "@/lib/utils";

/** Correos del equipo y de avisos (Configuración › Tienda). Solo la dueña. */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    return NextResponse.json(await getStoreEmailSettings(params.storeId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STORE_EMAIL_SETTINGS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function PATCH(req: Request, { params }: { params: { storeId: string } }) {
  try {
    await requireStoreOwner(params.storeId);
    const parsed = storeEmailSettingsInputSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw ErrorFactory.InvalidRequest("Revisa las listas de correos");
    await saveStoreEmailSettings(params.storeId, parsed.data);
    return NextResponse.json(await getStoreEmailSettings(params.storeId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STORE_EMAIL_SETTINGS_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
