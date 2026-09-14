import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { CACHE_HEADERS } from "@/lib/utils";
import { pruneProcessedWhatsAppWebhookEvents } from "@/lib/whatsapp/webhook-retention";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const result = await pruneProcessedWhatsAppWebhookEvents();
    await recordJobRun("whatsapp-webhook-retention", {
      ok: true,
      detail: `${result.deleted} evento(s) de WhatsApp ya procesados eliminados (más de ${result.olderThanDays} días)`,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("whatsapp-webhook-retention", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "WHATSAPP_WEBHOOK_RETENTION_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
