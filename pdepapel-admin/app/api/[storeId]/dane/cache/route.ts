import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { checkIfStoreOwner } from "@/lib/utils";
import {
  getCacheStats,
  clearLocationsCache,
  getAllLocationsWithCache,
} from "@/lib/dane-api";

/**
 * GET /api/dane/cache - Get Redis cache statistics
 */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    // Only allow authenticated admins
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const stats = await getCacheStats();

    return NextResponse.json({
      success: true,
      stats,
      message: stats?.exists
        ? `Cache active, expires in ${stats.expiresIn}`
        : "Cache is empty",
    });
  } catch (error: any) {
    console.error("[DANE_CACHE_STATS]", error);
    return NextResponse.json(
      { error: error.message || "Failed to get cache stats" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dane/cache - Warm up cache (fetch and store locations)
 */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    // Only allow authenticated admins
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const locations = await getAllLocationsWithCache();

    return NextResponse.json({
      success: true,
      count: locations.length,
      message: `Successfully cached ${locations.length} locations`,
    });
  } catch (error: any) {
    console.error("[DANE_CACHE_WARMUP]", error);
    return NextResponse.json(
      { error: error.message || "Failed to warm up cache" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dane/cache - Clear Redis cache
 */
export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    // Only allow authenticated admins
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!(await checkIfStoreOwner(userId, params.storeId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    await clearLocationsCache();

    return NextResponse.json({
      success: true,
      message: "Cache cleared successfully",
    });
  } catch (error: any) {
    console.error("[DANE_CACHE_CLEAR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to clear cache" },
      { status: 500 }
    );
  }
}
