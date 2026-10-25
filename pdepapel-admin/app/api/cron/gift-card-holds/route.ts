import { NextResponse, type NextRequest } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { releaseExpiredGiftCardHolds } from "@/lib/gift-cards";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";

/**
 * Libera las reservas de tarjeta de regalo de pedidos cancelados o sin
 * pagar por más de siete días. Lo llama un cron de Vercel una vez al día con
 * `CRON_SECRET`; `admin-scheduled-tasks.yml` queda solo para correrlo a mano.
 * Un día sin correr solo alarga la reserva: al pagar tarde se reserva de
 * nuevo (`redeemGiftCardForOrder`), así que nunca se gasta saldo dos veces.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const result = await releaseExpiredGiftCardHolds(prismadb);
    if (result.failed.length > 0) {
      console.error("[GIFT_CARD_HOLDS] Some holds could not be released:", result.failed);
    }
    await recordJobRun("gift-card-holds", {
      ok: result.failed.length === 0,
      detail: `${result.released} liberada(s), ${result.skipped} sin cambios${result.failed.length ? `, ${result.failed.length} con error` : ""}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_HOLDS_CRON");
  }
}
