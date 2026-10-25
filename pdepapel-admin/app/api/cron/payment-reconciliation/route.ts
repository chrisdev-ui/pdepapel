import { NextResponse, type NextRequest } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { getBoldConfig } from "@/lib/bold";
import { requireCronAuth } from "@/lib/cron-auth";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { declineRetryWindowFromEnv, runPaymentReconciliation } from "@/lib/payment-reconciliation";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Conciliación de pagos en línea (cron de Vercel a las :35 de cada hora):
 * consulta a Bold y Wompi los pedidos sin cobrar y aplica lo que digan por el
 * mismo camino que los webhooks. Responde solo cifras, nunca pedidos.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const summary = await runPaymentReconciliation({
      wompi: { baseUrl: env.WOMPI_API_URL, privateKey: env.WOMPI_API_SECRET },
      bold: { identityKey: getBoldConfig().identityKey },
      // Solo el sandbox de pagos la define; en Vercel no existe.
      declineRetryWindowMs: declineRetryWindowFromEnv(process.env.PAYMENT_DECLINE_RETRY_WINDOW_MINUTES),
    });
    await recordJobRun("payment-reconciliation", { ok: summary.ok, detail: summary.detail });
    const { detail: _detail, ...counts } = summary;
    return NextResponse.json(counts, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("payment-reconciliation", {
      ok: false,
      detail: `La conciliación falló: ${error instanceof Error ? error.message : String(error)}`,
    });
    return handleErrorResponse(error, "PAYMENT_RECONCILIATION_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
