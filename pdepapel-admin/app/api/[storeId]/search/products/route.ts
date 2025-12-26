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

    // ---------------------------------------------------------
    // REDIS CACHING (1 Hour)
    // ---------------------------------------------------------
    const cacheKey = `store:${params.storeId}:search:${search}:${page}:${limit}:v2`;
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            ...corsHeaders,
            "X-Cache": "HIT",
          },
        });
      }
    } catch (error) {
      console.error("Redis get error:", error);
    }

    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        isArchived: false,
        OR: [
          {
            name: search !== "" ? { search } : undefined, // Fulltext if supported
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
      take: limit * 5, // Fetch more to allow for grouping deduplication
      skip,
      include: {
        images: {
          orderBy: { isMain: "desc" },
          take: 1,
        },
        productGroup: {
          include: {
            images: {
              orderBy: { isMain: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    const { getProductsPrices } = await import("@/lib/discount-engine");
    const pricesMap = await getProductsPrices(products, params.storeId);

    const processedResults = new Map<string, any>();

    for (const product of products) {
      // If product belongs to a group, we show the Group
      if (product.productGroup) {
        const groupId = product.productGroup.id;
        if (!processedResults.has(groupId)) {
          // Use Group Data
          const groupImage =
            product.productGroup.images[0] || product.images[0];

          const priceInfo = pricesMap.get(product.id);
          const effectivePrice = priceInfo?.price ?? Number(product.price);

          processedResults.set(groupId, {
            id: groupId,
            name: product.productGroup.name,
            price: effectivePrice, // Representative price
            image: groupImage,
            isGroup: true,
          });
        }
      } else {
        // Standalone Product
        if (!processedResults.has(product.id)) {
          const priceInfo = pricesMap.get(product.id);
          const effectivePrice = priceInfo?.price ?? Number(product.price);

          processedResults.set(product.id, {
            id: product.id,
            name: product.name,
            price: effectivePrice,
            image: product.images[0],
            isGroup: false,
          });
        }
      }
    }

    // Convert Map to Array and Slice
    const productsWithDiscounts = Array.from(processedResults.values()).slice(
      0,
      limit,
    );

    // Cache Response
    try {
      const { Redis } = await import("@upstash/redis");
      const redis = Redis.fromEnv();
      await redis.set(cacheKey, productsWithDiscounts, { ex: 3600 });
    } catch (error) {
      console.error("Redis set error:", error);
    }

    return NextResponse.json(productsWithDiscounts, {
      headers: {
        ...corsHeaders,
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    return handleErrorResponse(error, "SEARCH_PRODUCTS", {
      headers: corsHeaders,
    });
  }
}
