import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs";
import { Redis } from "@upstash/redis";

import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";

// Cache Headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();

    if (!userId) {
      return new NextResponse("Unauthenticated", { status: 401 });
    }

    if (!params.storeId) {
      return new NextResponse("Store ID is required", { status: 400 });
    }

    // Verify ownership (Admin access only)
    // This is crucial since we are skipping storefront logic
    await verifyStoreOwner(userId, params.storeId);

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q") || "";
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 20;
    const skip = (page - 1) * limit;

    // Redis Caching Logic
    // Key format: store:{storeId}:admin-select:{normalized_query}:{page}
    const redis = Redis.fromEnv();
    const cacheKey = `store:${params.storeId}:admin-select:${query.toLowerCase().trim()}:${page}`;

    // 1. Try Cache
    try {
      const cachedData = await redis.get(cacheKey);
      if (cachedData) {
        return NextResponse.json(cachedData, {
          headers: {
            "X-Cache": "HIT",
            ...corsHeaders,
          },
        });
      }
    } catch (error) {
      console.warn("Redis Error (Get):", error);
      // Fallback to DB if Redis fails
    }

    // 2. Query Database (Lightweight)
    // Fetch one extra item to determine if there is a next page
    const products = await prismadb.product.findMany({
      where: {
        storeId: params.storeId,
        isArchived: false,
        OR: [{ name: { contains: query } }, { sku: { contains: query } }],
      },
      select: {
        id: true,
        name: true,
        sku: true,
        stock: true,
        acqPrice: true,
        images: {
          take: 1,
          select: { url: true },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
      take: limit + 1, // Fetch one extra to check for next page
      skip: skip,
    });

    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;

    const response = {
      data,
      metadata: {
        hasMore,
        nextPage: hasMore ? page + 1 : null,
      },
    };

    // 3. Store in Cache (TTL: 60 seconds)
    try {
      await redis.set(cacheKey, JSON.stringify(response), { ex: 60 });
    } catch (error) {
      console.warn("Redis Error (Set):", error);
    }

    return NextResponse.json(response, {
      headers: {
        "X-Cache": "MISS",
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.log("[PRODUCTS_SEARCH_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
