import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { assignBrandToProducts, previewBrandAssignment } from "@/lib/brands";
import { invalidateStoreProductsCache, storefrontScopeOf } from "@/lib/cache";
import { resolveMatchingProductIds } from "@/lib/product-selection";
import { BRANDS_INDEX_PATH, BRANDS_TAG, PRODUCT_LIST_TAG } from "@/lib/storefront-cache-scope";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

export const maxDuration = 60;

const bodySchema = z
  .object({
    brandId: z.string().min(1).nullable(),
    productIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
    /** «Los N de este filtro»: la consulta de la lista y cuántos se confirmaron. */
    match: z.object({ query: z.string().max(4000), expectedCount: z.number().int().nonnegative().optional() }).optional(),
    /** Con `match`: de los que ya tienen otra marca, los que sí se cambian. */
    replaceIds: z.array(z.string().min(1)).max(5000).default([]),
    preview: z.boolean().default(false),
  })
  .refine((body) => Boolean(body.productIds) !== Boolean(body.match), { message: "Envía productIds o match, no los dos" })
  .refine((body) => body.preview || !body.match || body.match.expectedCount !== undefined, { message: "Falta cuántos productos se confirmaron" });

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

    const body = bodySchema.parse(await req.json());
    const { brandId, preview } = body;
    let productIds = body.productIds ?? [];
    let matching: number | null = null;
    if (body.match) {
      // El servidor vuelve a correr la consulta de la lista y exige el número confirmado.
      const ids = await resolveMatchingProductIds(params.storeId, body.match);
      matching = ids.length;
      // Los que ya tienen otra marca solo cambian si se marcaron.
      const all = await previewBrandAssignment(params.storeId, brandId, ids);
      const conflicts = new Set(all.withOtherBrand.map((row) => row.id));
      const replace = new Set(body.replaceIds);
      // «Quitar marca» va solo a los que tienen una; «Asignar», a todos menos los que conservan la suya.
      productIds = brandId === null ? ids.filter((id) => conflicts.has(id)) : ids.filter((id) => !conflicts.has(id) || replace.has(id));
      if (preview) {
        const included = productIds.length ? await previewBrandAssignment(params.storeId, brandId, productIds) : { requested: 0, extraVariants: 0, groups: 0 };
        return NextResponse.json(
          { requested: included.requested, extraVariants: included.extraVariants, groups: included.groups, withOtherBrand: all.withOtherBrand, matching },
          { headers: CACHE_HEADERS.NO_CACHE },
        );
      }
      if (productIds.length === 0) throw ErrorFactory.InvalidRequest("No queda ningún producto para cambiar");
    }
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
