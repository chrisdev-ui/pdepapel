import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { listPublicBrands } from "@/lib/brand-public";
import { brandInputSchema, createBrand } from "@/lib/brands";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

/** Lista pública (tienda): marcas visibles y sin archivar; `?conProductos=1` deja solo las que tienen productos activos. */
export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    const withProducts = new URL(req.url).searchParams.get("conProductos") === "1";
    const brands = await listPublicBrands(params.storeId, { withProducts });
    return NextResponse.json(brands, { headers: CACHE_HEADERS.STATIC });
  } catch (error) {
    return handleErrorResponse(error, "BRANDS_GET");
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const input = brandInputSchema.parse(await req.json());
    // Una marca nueva no tiene productos: nada que purgar en la tienda.
    const brand = await createBrand(params.storeId, userId, input);
    return NextResponse.json(brand, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BRANDS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
