import { requireStoreRead } from "@/lib/store-access";
import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { searchScopeProducts } from "@/lib/offer-scope";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextResponse } from "next/server";

/** Selector de alcance de una oferta: productos buscados de a 20, con las ofertas que ya los alcanzan. */
export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await requireStoreRead(params.storeId);
    const { searchParams } = new URL(req.url);
    const result = await searchScopeProducts(prismadb, params.storeId, {
      query: searchParams.get("q") ?? "",
      includeOutOfStock: searchParams.get("agotados") === "1",
      limit: Number(searchParams.get("limit")) || undefined,
      excludeOfferId: searchParams.get("excluir") || null,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_SCOPE_SEARCH");
  }
}
