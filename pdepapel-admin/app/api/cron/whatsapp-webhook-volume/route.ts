import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { CACHE_HEADERS } from "@/lib/utils";
import {
  countTodayWebhookEvents,
  findTopContactToday,
  judgeWebhookVolume,
  resolveVolumeThreshold,
} from "@/lib/whatsapp/webhook-volume";

export const dynamic = "force-dynamic";

/**
 * Vigila cuántos eventos de WhatsApp lleva el día.
 *
 * El aviso no necesita servicio nuevo: se registra como corrida de tarea y
 * «Sistemas», en Inicio, ya pinta en rojo lo que viene con `ok: false`. Es
 * donde Paula ya mira cuando algo va mal.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const [total, topContact] = await Promise.all([
      countTodayWebhookEvents(),
      findTopContactToday().catch(() => null),
    ]);
    const verdict = judgeWebhookVolume({
      total,
      threshold: resolveVolumeThreshold(),
      topContact,
    });

    await recordJobRun("whatsapp-webhook-volume", {
      // `ok: false` es lo que hace que salga marcada en «Sistemas».
      ok: !verdict.alert,
      detail: verdict.detail,
    });

    return NextResponse.json(verdict, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("whatsapp-webhook-volume", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "WHATSAPP_WEBHOOK_VOLUME_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
