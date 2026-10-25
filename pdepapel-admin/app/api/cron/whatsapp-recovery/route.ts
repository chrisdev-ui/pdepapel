import { NextRequest, NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { recordJobRun } from "@/lib/job-runs";
import { CACHE_HEADERS } from "@/lib/utils";
import { sweepWhatsAppEvents } from "@/lib/whatsapp/recovery";

export const dynamic = "force-dynamic";

/** Respaldo diario de la recuperación de WhatsApp (lib/whatsapp/recovery.ts): sin la ventana de 2 min. */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
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
