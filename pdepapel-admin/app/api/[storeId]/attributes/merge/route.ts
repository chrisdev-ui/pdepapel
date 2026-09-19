import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  attributeMergeMessage,
  attributeMergeRevalidationPaths,
  mergeAttributes,
  parseAttributeMergeBody,
  previewAttributeMerge,
} from "@/lib/attribute-merge";
import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Une atributos del catálogo (solo dueño de la tienda):
 * `{ kind: "categories" | "sizes" | "colors" | "designs", sourceIds, targetId, dryRun? }`.
 * Con `dryRun` responde la vista previa (conteos y colisiones) sin escribir.
 * Sin él, mueve los productos al destino, archiva las fuentes y refresca la
 * tienda; si algún grupo quedaría con dos variantes iguales responde 409.
 */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const { dryRun, ...input } = parseAttributeMergeBody(await req.json().catch(() => ({})));

    if (dryRun) {
      const preview = await previewAttributeMerge(prismadb, { storeId: params.storeId, input });
      return NextResponse.json(preview, { headers: CACHE_HEADERS.NO_CACHE });
    }

    const result = await prismadb.$transaction((tx) => mergeAttributes(tx, { storeId: params.storeId, input }));

    await Promise.all([
      triggerStorefrontRevalidation({
        paths: attributeMergeRevalidationPaths(result.categorySlugs),
        tags: ["categories", "products"],
      }),
      invalidateStoreProductsCache(params.storeId),
    ]);

    return NextResponse.json(
      { message: attributeMergeMessage(result.preview, result.moved), moved: result.moved, preview: result.preview },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "ATTRIBUTES_MERGE_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
