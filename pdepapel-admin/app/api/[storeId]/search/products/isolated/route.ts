import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    // Strict Owner Validation
    await verifyStoreOwner(userId, params.storeId);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const categoryId = searchParams.get("categoryId") || undefined;
    const limit = parseInt(searchParams.get("limit") || "20");
    const page = parseInt(searchParams.get("page") || "1");
    const skip = (page - 1) * limit;

    const whereClause: any = {
      storeId: params.storeId,
      productGroupId: null, // Only standalone products
      isArchived: false,
    };

    if (query) {
      whereClause.OR = [
        {
          name: {
            contains: query,
          },
        },
        {
          description: {
            contains: query,
          },
        },
      ];
    }

    if (categoryId && categoryId !== "all") {
      whereClause.categoryId = categoryId;
    }

    // Limit + 1 Strategy to avoid Count query
    const products = await prismadb.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        price: true,
        sku: true,
        acqPrice: true,
        stock: true,
        supplierId: true,
        isFeatured: true,
        isArchived: true,
        productGroupId: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        size: {
          select: {
            id: true,
            name: true,
            value: true,
          },
        },
        color: {
          select: {
            id: true,
            name: true,
            value: true,
          },
        },
        design: {
          select: {
            id: true,
            name: true,
          },
        },
        images: {
          select: {
            url: true,
            isMain: true,
          },
          orderBy: {
            isMain: "desc", // Put main image first
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit + 1, // Fetch one extra to check if there is a next page
      skip: skip,
    });

    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;

    return NextResponse.json({
      data,
      metadata: {
        page,
        limit,
        hasMore,
      },
    });
  } catch (error) {
    console.log("[PRODUCTS_ISOLATED_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
