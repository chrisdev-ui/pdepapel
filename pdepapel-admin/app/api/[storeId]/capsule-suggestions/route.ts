import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getEditionSuggestions } from "@/lib/capsule-suggestion-data";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Ediciones sugeridas, «Te faltan estos» y «Revisar licencia». Solo la dueña: llevan costos y bandas. */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(await getEditionSuggestions(params.storeId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SUGGESTIONS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
