import { NextResponse, type NextRequest } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { releaseExpiredGiftCardHolds } from "@/lib/gift-cards";
import prismadb from "@/lib/prismadb";

/**
 * Libera las reservas de tarjeta de regalo de pedidos cancelados o sin
 * pagar por más de siete días. Lo llama el flujo `admin-scheduled-tasks.yml`
 * una vez al día con `CRON_SECRET`; los dos crons de Vercel están ocupados.
 * Un día sin correr solo alarga la reserva: al pagar tarde se reserva de
 * nuevo (`redeemGiftCardForOrder`), así que nunca se gasta saldo dos veces.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

    const result = await releaseExpiredGiftCardHolds(prismadb);
    if (result.failed.length > 0) {
      console.error("[GIFT_CARD_HOLDS] Some holds could not be released:", result.failed);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_HOLDS_CRON");
  }
}
