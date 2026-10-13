import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { CACHE_HEADERS } from "@/lib/utils";
import { sweepWhatsAppEvents } from "@/lib/whatsapp/recovery";

export const dynamic = "force-dynamic";

/** Respaldo diario de la recuperación de WhatsApp (lib/whatsapp/recovery.ts): sin la ventana de 2 min. */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();
    const result = await sweepWhatsAppEvents({ force: true });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("whatsapp-recovery", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "WHATSAPP_RECOVERY_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
