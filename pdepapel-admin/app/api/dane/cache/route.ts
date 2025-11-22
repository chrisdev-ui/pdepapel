import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";
import {
  getCacheStats,
  clearLocationsCache,
  getAllLocationsWithCache,
} from "@/lib/dane-api";

/**
 * GET /api/dane/cache - Get Redis cache statistics
 */
export async function GET() {
  try {
    // Only allow authenticated admins
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
export async function POST() {
  try {
    // Only allow authenticated admins
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
export async function DELETE() {
  try {
    // Only allow authenticated admins
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
