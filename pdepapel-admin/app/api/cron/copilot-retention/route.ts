import { NextResponse, type NextRequest } from "next/server";

import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { applyCopilotRetention, planCopilotRetention } from "@/lib/copiloto/retention";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { resolveScheduledJobMode } from "@/lib/scheduled-jobs";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Borra las conversaciones del copiloto sin actividad en 180 días. Sin `mode=apply` solo cuenta. */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();
    const mode = resolveScheduledJobMode(request.url, "copilot-retention");

    const result = mode === "apply" ? await applyCopilotRetention() : await planCopilotRetention();
    if (mode === "apply") {
      await recordJobRun("copilot-retention", {
        ok: true,
        detail: `${result.conversations} conversación(es) del copiloto eliminadas (${result.messages} mensajes, más de ${result.olderThanDays} días sin actividad)`,
      });
    }
    return NextResponse.json({ mode, ...result }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    if (!(error instanceof AppError && error.statusCode < 500)) {
      await recordJobRun("copilot-retention", { ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
    return handleErrorResponse(error, "COPILOT_RETENTION_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
