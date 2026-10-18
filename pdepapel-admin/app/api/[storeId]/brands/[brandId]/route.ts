import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { findPublicBrand } from "@/lib/brand-public";
import {
  brandFlagsSchema,
  brandInputSchema,
  deleteBrand,
  updateBrand,
  updateBrandFlags,
} from "@/lib/brands";
import { brandStorefrontTarget } from "@/lib/brand-cache";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { deleteCloudinaryImages } from "@/lib/cloudinary-cleanup";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Pública: la marca de /marcas/[slug] (aquí `brandId` es el slug). Una
 * dirección anterior responde `{ redirectTo }`; oculta o archivada, 404.
 */
export async function GET(_req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const found = await findPublicBrand(params.storeId, params.brandId.toLowerCase());
    if (found.kind === "missing") throw ErrorFactory.NotFound("Marca no encontrada");
    if (found.kind === "redirect") {
      return NextResponse.json({ redirectTo: found.slug }, { headers: CACHE_HEADERS.STATIC });
    }
    return NextResponse.json(found.brand, { headers: CACHE_HEADERS.STATIC });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_GET");
  }
}

/** Edición completa (formulario) o solo los interruptores de la lista (`{ isVisible }` / `{ isFeatured }`). */
export async function PATCH(req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    if (body && typeof body === "object" && !("name" in body)) {
      const brand = await updateBrandFlags(params.storeId, params.brandId, brandFlagsSchema.parse(body));
      await invalidateStoreProductsCache(
        params.storeId,
        await brandStorefrontTarget(params.storeId, { brandIds: [brand.id] }),
      );
      return NextResponse.json(brand, { headers: CACHE_HEADERS.NO_CACHE });
    }

    const { brand, replacedLogos } = await updateBrand(params.storeId, params.brandId, brandInputSchema.parse(body));
    // Después del commit y con tope: nombre, logo, color o visibilidad cambian
    // lo que la tienda muestra de todos sus productos.
    await invalidateStoreProductsCache(
      params.storeId,
      await brandStorefrontTarget(params.storeId, { brandIds: [brand.id] }),
    );
    if (replacedLogos.length > 0) await deleteCloudinaryImages(replacedLogos, "BRAND_PATCH");
    return NextResponse.json(brand, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Solo sin productos ni grupos; con productos se archiva o se fusiona. */
export async function DELETE(_req: Request, { params }: { params: { storeId: string; brandId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const brand = await deleteBrand(params.storeId, params.brandId);
    await deleteCloudinaryImages(
      [brand.logoUrl, brand.logoInverseUrl].filter((url): url is string => Boolean(url)),
      "BRAND_DELETE",
    );
    return NextResponse.json({ id: brand.id }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRAND_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
