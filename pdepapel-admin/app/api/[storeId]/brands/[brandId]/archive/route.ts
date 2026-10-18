import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { setBrandArchived } from "@/lib/brands";
import { brandStorefrontTarget } from "@/lib/brand-cache";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

const bodySchema = z.object({ isArchived: z.boolean() });

/** Archivar (o desarchivar): sus productos la conservan, pero la tienda y los datos dejan de mostrarla. */
export async function POST(req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const { isArchived } = bodySchema.parse(await req.json());
    const brand = await setBrandArchived(params.storeId, params.brandId, isArchived);
    await invalidateStoreProductsCache(
      params.storeId,
      await brandStorefrontTarget(params.storeId, { brandIds: [brand.id] }),
    );
    return NextResponse.json(brand, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_ARCHIVE_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
