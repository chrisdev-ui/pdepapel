import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { processMercadoLibreHealthChecks } from "@/lib/mercadolibre/health-cron";
import { env } from "@/lib/env.mjs";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const result = await processMercadoLibreHealthChecks();
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_HEALTH_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
