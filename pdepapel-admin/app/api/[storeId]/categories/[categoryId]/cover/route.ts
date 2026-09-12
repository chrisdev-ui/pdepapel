import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { ensureCategoryAssets, isCategoryAssetPart, isCategoryCoverConfigured } from "@/lib/category-covers";
import prismadb from "@/lib/prismadb";
import { missingTaxonomyMessage } from "@/lib/taxonomy";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

/**
 * Genera con IA la portada, la intro o las dos de una subcategoría (solo dueña
 * de la tienda). Cuerpo: `{ part?: "cover" | "intro" | "both", force?: boolean }`;
 * `part` por defecto es `both` y `force` regenera aunque ya exista. Es el
 * único lugar donde se llama a OpenAI: crear la subcategoría nunca espera aquí.
 */
export async function POST(req: Request, { params }: { params: { storeId: string; categoryId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId) throw ErrorFactory.InvalidRequest("Se requiere el ID de la subcategoría.");
    await verifyStoreOwner(userId, params.storeId);

    if (!isCategoryCoverConfigured()) {
      throw ErrorFactory.InvalidRequest("La generación con IA no está configurada: agrega OPENAI_API_KEY en el proyecto del panel.");
    }

    const body = (await req.json().catch(() => ({}))) as { part?: unknown; force?: unknown };
    if (body.part !== undefined && !isCategoryAssetPart(body.part)) {
      throw ErrorFactory.InvalidRequest("Indica qué generar: la portada (cover), la intro (intro) o las dos (both).");
    }

    const category = await prismadb.category.findFirst({
      where: { id: params.categoryId, storeId: params.storeId },
      select: { id: true },
    });
    if (!category) throw ErrorFactory.NotFound(missingTaxonomyMessage("category"));

    const result = await ensureCategoryAssets(params.storeId, params.categoryId, {
      force: Boolean(body.force),
      part: body.part ?? "both",
    });
    if (result.generated.length > 0) await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_COVER_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
