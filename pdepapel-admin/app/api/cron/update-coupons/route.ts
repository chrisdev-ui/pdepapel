import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
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

/**
 * Cron diario: apaga los cupones vencidos o agotados. Nunca enciende ninguno,
 * así un cupón apagado a mano se queda apagado; los programados entran en
 * vigencia solos por sus fechas.
 */
export async function GET(req: NextRequest) {
  try {
    const authToken = req.headers.get("authorization")?.split("Bearer ").at(1);

    if (!authToken || authToken !== env.CRON_SECRET)
      throw ErrorFactory.Unauthorized();

    const now = new Date();

    const expiredCoupons = await prismadb.coupon.updateMany({
      where: {
        isActive: true,
        OR: [
          { endDate: { lt: now } },
          {
            AND: [
              { maxUses: { not: null } },
              { usedCount: { gte: prismadb.coupon.fields.maxUses } },
            ],
          },
        ],
      },
      data: { isActive: false },
    });

    await recordJobRun("update-coupons", {
      ok: true,
      detail: `${expiredCoupons.count} apagados por vencimiento o agotamiento`,
    });

    return NextResponse.json(
      { deactivated: expiredCoupons.count },
      { headers: corsHeaders },
    );
  } catch (error) {
    await recordJobRun("update-coupons", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "COUPONS_CRON", { headers: corsHeaders });
  }
}
