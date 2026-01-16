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

    // ---------------------------------------------------------
    // HYBRID SEARCH: Raw SQL for Ranking + Prisma for Data
    // ---------------------------------------------------------

    // 1. Get Ranked IDs using Raw SQL
    // We prioritize:
    // - Exact Name Match (Score 100)
    // - Name Starts With Query (Score 50)
    // - Name Contains Query (Score 20)
    // - Description Contains Query (Score 5)
    const rawIds = await prismadb.$queryRaw<{ id: string }[]>`
      SELECT id,
      (
        CASE
          WHEN name ILIKE ${search} THEN 100
          WHEN name ILIKE ${`${search}%`} THEN 50
          WHEN name ILIKE ${`%${search}%`} THEN 20
          WHEN description ILIKE ${`%${search}%`} THEN 5
          ELSE 0
        END
      ) as relevance
      FROM "Product"
      WHERE "storeId" = ${params.storeId}
        AND "isArchived" = false
        AND (name ILIKE ${`%${search}%`} OR description ILIKE ${`%${search}%`})
      ORDER BY relevance DESC, "createdAt" DESC
      LIMIT ${limit * 5}
      OFFSET ${skip}
    `;

    const productIds = rawIds.map((p) => p.id);

    // 2. Fetch Full Data for these IDs using Prisma
    // Note: findMany does NOT respect the order of "in" array, so we must resort later
    const unsortedProducts = await prismadb.product.findMany({
      where: {
        id: { in: productIds },
        storeId: params.storeId, // Redundant but safe
      },
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
            products: {
              select: {
                stock: true,
              },
            },
          },
        },
      },
    });

    // 3. Sort products to match the Raw SQL order
    const products = productIds
      .map((id) => unsortedProducts.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => p !== undefined);

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
            stock: product.productGroup.products.reduce(
              (acc, p) => acc + p.stock,
              0,
            ),
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
            stock: product.stock,
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
