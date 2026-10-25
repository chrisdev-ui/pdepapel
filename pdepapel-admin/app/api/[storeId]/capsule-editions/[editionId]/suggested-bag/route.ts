import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getSuggestedBag } from "@/lib/capsule-suggestion-data";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

/** «Sugerir bolsa»: los temas con productos quietos en la banda de la edición y, con `?tema=`, la bolsa sugerida. Solo la dueña. */
export async function GET(req: Request, { params }: { params: { storeId: string; editionId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const themeKey = new URL(req.url).searchParams.get("tema");
    return NextResponse.json(await getSuggestedBag({ storeId: params.storeId, editionId: params.editionId, themeKey: themeKey || null }), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SUGGESTED_BAG_GET", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404] });
  }
}
