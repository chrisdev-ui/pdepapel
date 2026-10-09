import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { judgeDbHealth, readDbHealth, resolveDbMemoryLimitMb } from "@/lib/db-health";
import { sendDbHealthAlert } from "@/lib/db-health-alert";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { readMysqlContainerMemory } from "@/lib/railway-metrics";
import { CACHE_HEADERS } from "@/lib/utils";
import { countPendingWhatsAppReplays } from "@/lib/whatsapp/webhook-replay";

export const dynamic = "force-dynamic";

/** Revisión diaria de MySQL; un aviso sale en rojo en «Sistemas», en Inicio. */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const [reading, pendingWhatsAppReplays, container] = await Promise.all([
      readDbHealth(),
      countPendingWhatsAppReplays().catch(() => 0),
      readMysqlContainerMemory(),
    ]);
    const verdict = judgeDbHealth({ ...reading, limitMb: resolveDbMemoryLimitMb(), pendingWhatsAppReplays, container });
    await recordJobRun("db-health", { ok: !verdict.alert, detail: verdict.detail });
    if (verdict.containerAlert) {
      await sendDbHealthAlert(verdict.containerWarnings, verdict.detail);
    }

    return NextResponse.json(verdict, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("db-health", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "DB_HEALTH_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
