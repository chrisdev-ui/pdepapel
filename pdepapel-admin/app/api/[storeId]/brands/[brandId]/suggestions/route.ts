import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getBrandSuggestions } from "@/lib/brands";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

/** «Sugerencias automáticas» de una marca (solo la dueña). */
export async function GET(_req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const suggestions = await getBrandSuggestions(params.storeId, params.brandId);
    return NextResponse.json(suggestions, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_SUGGESTIONS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
