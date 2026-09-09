import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { ensureCategoryAssets, isCategoryCoverConfigured } from "@/lib/category-covers";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

/** Genera (o regenera con `force`) la portada y la intro de una categoría. Solo dueña de la tienda. */
export async function POST(req: Request, { params }: { params: { storeId: string; categoryId: string } }) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (!isCategoryCoverConfigured()) {
      throw ErrorFactory.InvalidRequest("La generación de portadas no está configurada: agrega OPENAI_API_KEY en el proyecto del panel.");
    }

    const body = await req.json().catch(() => ({}));
    const result = await ensureCategoryAssets(params.storeId, params.categoryId, { force: Boolean(body?.force) });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_COVER_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
