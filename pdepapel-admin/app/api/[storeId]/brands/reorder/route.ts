import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { reorderBrands } from "@/lib/brands";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { BRANDS_INDEX_PATH, BRANDS_TAG, PRODUCT_LIST_TAG } from "@/lib/storefront-cache-scope";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

const bodySchema = z.object({ orderedIds: z.array(z.string().min(1)).min(1).max(500) });

/** Orden de las marcas (arrastrar o ↑ ↓): así salen en el filtro y el menú de la tienda. */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { orderedIds } = bodySchema.parse(await req.json());
    await reorderBrands(params.storeId, orderedIds);
    // El orden solo cambia la lista de marcas y el filtro de los listados.
    await invalidateStoreProductsCache(params.storeId, {
      extra: { tags: [BRANDS_TAG, PRODUCT_LIST_TAG], paths: [BRANDS_INDEX_PATH] },
    });
    return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRANDS_REORDER_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
