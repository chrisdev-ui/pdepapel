import { NextRequest, NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { recordJobRun } from "@/lib/job-runs";
import { CACHE_HEADERS } from "@/lib/utils";
import { pruneProcessedWhatsAppWebhookEvents, pruneWhatsAppBotShadowRuns } from "@/lib/whatsapp/webhook-retention";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    // `?mode=dry-run` solo cuenta las filas del modo sombra; sin parámetro, borra como siempre.
    const dryRun = new URL(request.url).searchParams.get("mode") === "dry-run";
    if (dryRun) {
      const shadow = await pruneWhatsAppBotShadowRuns({ dryRun: true });
      return NextResponse.json({ mode: "dry-run", shadow }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    const result = await pruneProcessedWhatsAppWebhookEvents();
    const shadow = await pruneWhatsAppBotShadowRuns();
    await recordJobRun("whatsapp-webhook-retention", {
      ok: true,
      detail: `${result.deleted} evento(s) de WhatsApp ya procesados eliminados (más de ${result.olderThanDays} días) · ${shadow.deleted} fila(s) del modo sombra (más de ${shadow.olderThanDays} días)`,
    });
    return NextResponse.json({ ...result, shadow }, { headers: CACHE_HEADERS.NO_CACHE });
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
