import { NextRequest, NextResponse } from "next/server";

import { fetchCatalogProducts } from "@/lib/catalog-fetch";
import { parseCatalogSearchParams } from "@/lib/catalog-params";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = parseCatalogSearchParams(request.nextUrl.searchParams);
  const products = await fetchCatalogProducts(query);

  return NextResponse.json(products, {
    headers: { "Cache-Control": "no-store" },
  });
}
