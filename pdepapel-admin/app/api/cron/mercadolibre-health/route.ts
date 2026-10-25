import { NextRequest, NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { runMercadoLibreHealthJob } from "@/lib/mercadolibre/health-job";
import { CACHE_HEADERS } from "@/lib/utils";
import { recordJobRun } from "@/lib/job-runs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const result = await runMercadoLibreHealthJob();
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("mercadolibre-health", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "MERCADOLIBRE_HEALTH_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
