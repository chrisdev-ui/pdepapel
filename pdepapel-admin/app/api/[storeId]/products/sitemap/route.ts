import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createCorsHeaders } from "@/lib/cors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextResponse } from "next/server";

export async function OPTIONS(req: Request) {
  return NextResponse.json(
    {},
    {
      headers: createCorsHeaders(req, { methods: "GET, OPTIONS" }),
    },
  );
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  const headers = {
    ...createCorsHeaders(req, { methods: "GET, OPTIONS" }),
    ...CACHE_HEADERS.SEMI_STATIC,
  };

  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        isArchived: false,
      },
      select: {
        id: true,
        slug: true,
        updatedAt: true,
        isArchived: true,
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(products, { headers });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_SITEMAP_GET", { headers });
  }
}
