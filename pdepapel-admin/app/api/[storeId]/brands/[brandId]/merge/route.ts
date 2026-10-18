import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { mergeBrands } from "@/lib/brands";
import { brandStorefrontTarget } from "@/lib/brand-cache";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const bodySchema = z.object({ targetBrandId: z.string().min(1), copyLogo: z.boolean().default(false) });

/** «Fusionar con otra marca…»: todo A pasa a B en una transacción y A queda archivada. */
export async function POST(req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { targetBrandId, copyLogo } = bodySchema.parse(await req.json());
    const summary = await mergeBrands(params.storeId, params.brandId, targetBrandId, { copyLogo });
    // Después de la fusión todos los productos son de B; las direcciones de A
    // ya son redirecciones de B y salen con ella.
    await invalidateStoreProductsCache(
      params.storeId,
      await brandStorefrontTarget(params.storeId, { brandIds: [params.brandId, targetBrandId] }),
    );
    return NextResponse.json(summary, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_MERGE_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
