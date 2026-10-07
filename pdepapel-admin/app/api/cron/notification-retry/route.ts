import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { MAX_EMAIL_ATTEMPTS, retryFailedNotifications, RETRY_WINDOW_HOURS } from "@/lib/notification-retry";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Reenvía los correos de pedido que no salieron en las últimas 48 h
 * (lib/notification-retry.ts). Lo llama «Admin scheduled tasks» con
 * CRON_SECRET. Solo correos: las guías de EnvioClick no se reintentan.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const summary = await retryFailedNotifications();
    const detail =
      `${summary.sent.length} reenviado(s), ${summary.failed.length} siguen fallando, ` +
      `${summary.superseded} ya no aplican, ${summary.exhausted} agotados (${MAX_EMAIL_ATTEMPTS} intentos), ` +
      `de ${summary.scanned} pendiente(s) de las últimas ${RETRY_WINDOW_HOURS} h`;
    await recordJobRun("notification-retry", { ok: summary.failed.length === 0, detail });
    return NextResponse.json(
      {
        scanned: summary.scanned,
        sent: summary.sent.length,
        failed: summary.failed.length,
        superseded: summary.superseded,
        exhausted: summary.exhausted,
        alreadyClaimed: summary.alreadyClaimed,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    await recordJobRun("notification-retry", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "NOTIFICATION_RETRY_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
