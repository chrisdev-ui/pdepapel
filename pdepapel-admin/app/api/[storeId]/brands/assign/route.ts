import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { assignBrandToProducts, previewBrandAssignment } from "@/lib/brands";
import { invalidateStoreProductsCache, storefrontScopeOf } from "@/lib/cache";
import { BRANDS_INDEX_PATH, BRANDS_TAG, PRODUCT_LIST_TAG } from "@/lib/storefront-cache-scope";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

const bodySchema = z.object({
  brandId: z.string().min(1).nullable(),
  productIds: z.array(z.string().min(1)).min(1).max(1000),
  preview: z.boolean().default(false),
});

/**
 * «Asignar marca» en bloque y desde «Sugerencias automáticas». Con
 * `preview` solo cuenta: cuántos ya tienen otra marca y cuántas variantes
 * cambian además por estar en el mismo grupo.
 */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { brandId, productIds, preview } = bodySchema.parse(await req.json());
    if (preview) {
      return NextResponse.json(await previewBrandAssignment(params.storeId, brandId, productIds), {
        headers: CACHE_HEADERS.NO_CACHE,
      });
    }
    const before = await storefrontScopeOf(params.storeId, { productIds });
    const result = await assignBrandToProducts(params.storeId, brandId, productIds);
    // La lista de marcas va también: una marca puede pasar a tener (o dejar
    // de tener) productos y aparecer o salir del menú y del filtro.
    await invalidateStoreProductsCache(params.storeId, {
      productIds: result.productIds,
      productGroupIds: result.productGroupIds,
      previous: before,
      extra: { tags: [BRANDS_TAG, PRODUCT_LIST_TAG], paths: [BRANDS_INDEX_PATH] },
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRANDS_ASSIGN_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
