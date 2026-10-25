import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { changeBrandSlug } from "@/lib/brands";
import { brandStorefrontTarget } from "@/lib/brand-cache";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

const bodySchema = z.object({ slug: z.string().min(1).max(140) });

/** «Cambiar dirección»: la anterior queda redirigiendo a la nueva. */
export async function POST(req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { slug } = bodySchema.parse(await req.json());
    const result = await changeBrandSlug(params.storeId, params.brandId, slug);
    if (result.previousSlug) {
      await invalidateStoreProductsCache(
        params.storeId,
        await brandStorefrontTarget(params.storeId, { brandIds: [params.brandId], slugs: [result.previousSlug, result.slug] }),
      );
    }
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_SLUG_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
