import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { moveCategoriesToType, parseMoveCategoriesBody } from "@/lib/attribute-merge";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { getCategoryRevalidationPaths } from "@/lib/category-slugs";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Mueve subcategorías a otra categoría (solo dueño): `{ ids, typeId }`.
 * La URL de cada subcategoría no cambia; el menú de la tienda sí.
 */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const input = parseMoveCategoriesBody(await req.json().catch(() => ({})));
    const result = await prismadb.$transaction((tx) => moveCategoriesToType(tx, { storeId: params.storeId, input }));

    await Promise.all([
      triggerStorefrontRevalidation({ paths: getCategoryRevalidationPaths(...result.categorySlugs), tags: ["categories", "products"] }),
      invalidateStoreProductsCache(params.storeId),
    ]);

    const noun = result.count === 1 ? "subcategoría pasó" : "subcategorías pasaron";
    return NextResponse.json(
      { message: `${result.count} ${noun} a «${result.typeName}»`, count: result.count },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "ATTRIBUTES_MOVE_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
