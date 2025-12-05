import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.DYNAMIC,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const search = req.nextUrl.searchParams.get("search") || "";
    const page = Number(req.nextUrl.searchParams.get("page")) || 1;
    const limit = Number(req.nextUrl.searchParams.get("limit")) || 10;
    const skip = (page - 1) * limit;

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        isArchived: false,
        OR: [
          {
            name: search !== "" ? { search } : undefined,
          },
          {
            description: search !== "" ? { search } : undefined,
          },
          {
            name: {
              contains: search,
            },
          },
          {
            description: {
              contains: search,
            },
          },
        ],
      },
      orderBy: {
        _relevance: {
          fields: ["name"],
          search,
          sort: "asc",
        },
      },
      take: limit,
      skip,
      include: {
        images: true,
      },
    });
    const { calculateDiscountedPrice } = await import("@/lib/discount-engine");

    const productsWithDiscounts = await Promise.all(
      products.map((product) =>
        calculateDiscountedPrice(product, params.storeId),
      ),
    );

    return NextResponse.json(productsWithDiscounts, { headers: corsHeaders });
  } catch (error) {
    return handleErrorResponse(error, "SEARCH_PRODUCTS", {
      headers: corsHeaders,
    });
  }
}
