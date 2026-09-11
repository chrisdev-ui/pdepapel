import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { processMercadoLibreHealthChecks } from "@/lib/mercadolibre/health-cron";
import { env } from "@/lib/env.mjs";
import { CACHE_HEADERS } from "@/lib/utils";
import { recordJobRun } from "@/lib/job-runs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const result = await processMercadoLibreHealthChecks();
    await recordJobRun("mercadolibre-health", {
      ok: result.failed === 0,
      detail: `${result.processed.length} ${result.processed.length === 1 ? "conexión revisada" : "conexiones revisadas"}${result.failed ? `, ${result.failed} con error` : ""}`,
    });
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
