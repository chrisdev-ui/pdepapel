import { NextRequest, NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { recordJobRun } from "@/lib/job-runs";
import { pruneSettledPaymentWebhookEvents } from "@/lib/payment-webhook-retention";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const result = await pruneSettledPaymentWebhookEvents();
    await recordJobRun("payment-webhook-retention", {
      ok: true,
      detail: `${result.deleted} evento(s) de pago ya resueltos eliminados (más de ${result.olderThanDays} días)`,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("payment-webhook-retention", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "PAYMENT_WEBHOOK_RETENTION_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
