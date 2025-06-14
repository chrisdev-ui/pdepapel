import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  ...CACHE_HEADERS.NO_CACHE,
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const authToken = req.headers.get("authorization")?.split("Bearer ").at(1);

    if (!authToken || authToken !== env.CRON_SECRET)
      throw ErrorFactory.Unauthorized();

    const now = new Date();

    const [expiredCoupons, validCoupons] = await prismadb.$transaction([
      // Update expired coupons
      prismadb.coupon.updateMany({
        where: {
          OR: [
            { endDate: { lt: now } },
            {
              AND: [
                { maxUses: { not: null } },
                { usedCount: { gte: prismadb.coupon.fields.maxUses } },
              ],
            },
          ],
          isActive: true,
        },
        data: { isActive: false },
      }),
      // Update valid coupons
      prismadb.coupon.updateMany({
        where: {
          AND: [
            { startDate: { lte: now } },
            { endDate: { gt: now } },
            {
              OR: [
                { maxUses: null },
                { usedCount: { lt: prismadb.coupon.fields.maxUses } },
              ],
            },
          ],
          isActive: false,
        },
        data: { isActive: true },
      }),
    ]);

    return NextResponse.json(
      {
        deactivated: expiredCoupons.count,
        activated: validCoupons.count,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_CRON", { headers: corsHeaders });
  }
}
