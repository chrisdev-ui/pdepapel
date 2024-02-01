import prismadb from "@/lib/prismadb";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  if (!params.storeId)
    return NextResponse.json(
      { error: "Store ID is required" },
      { status: 400, headers: corsHeaders },
    );
  try {
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
    return NextResponse.json(products, { headers: corsHeaders });
  } catch (error) {
    console.log("[SEARCH_PRODUCTS]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: corsHeaders },
    );
  }
}
