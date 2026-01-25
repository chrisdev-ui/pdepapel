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
      isArchived: false,
    };

    if (query) {
      whereClause.OR = [
        {
          name: {
            contains: query,
            mode: "insensitive", // Add case insensitive search if using Postgres, or keep generic for Prisma
          },
        },
        {
          description: {
            contains: query,
            mode: "insensitive",
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

    // We can also calculate discounted prices here if needed, but for selector listing usually base price is fine
    // Or we can inject it. For speed, let's inject it if easy.
    const { getProductsPrices } = await import("@/lib/discount-engine");
    // Cast to any to satisfy type check for this utility if it expects full product
    // ensure mapping happens correctly
    // The utility likely expects full products.
    // Let's rely on basic price for now or replicate the mapping.
    
    // NOTE: discount-engine expects specific fields. 
    // Let's assume we return standard data and the frontend helps or we do it here.
    // Doing it here is better for UI consistency.
    const pricesMap = await getProductsPrices(data as any[], params.storeId);

    const enrichedData = data.map(product => {
        const priceInfo = pricesMap.get(product.id);
        return {
            ...product,
            discountedPrice: priceInfo?.price ?? Number(product.price),
            offerLabel: priceInfo?.offerLabel,
            hasDiscount: priceInfo ? priceInfo.price < Number(product.price) : false,
        }
    });

    return NextResponse.json({
      data: enrichedData,
      metadata: {
        page,
        limit,
        hasMore,
      },
    });
  } catch (error) {
    console.log("[PRODUCTS_FLATTENED_GET]", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}
