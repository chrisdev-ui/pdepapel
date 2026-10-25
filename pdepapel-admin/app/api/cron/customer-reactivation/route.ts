import { NextResponse, type NextRequest } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";
import { processAutomaticReactivations } from "@/lib/reactivation";
import { resolveScheduledJobMode } from "@/lib/scheduled-jobs";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Correo de «te extrañamos» con un cupón a quien cumple 90 días sin comprar.
 * Apagado (`SCHEDULED_JOBS`): sin `mode=apply` solo cuenta a quién se le
 * escribiría. La respuesta lleva cifras, nunca correos.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const mode = resolveScheduledJobMode(request.url, "customer-reactivation");

    const stores = await prismadb.store.findMany({ select: { id: true } });
    const results = [];
    for (const store of stores) {
      const result = await processAutomaticReactivations(store.id, { dryRun: mode === "dry-run" });
      results.push({
        processed: result.processed,
        failed: result.errors?.length ?? 0,
        ...("wouldSend" in result
          ? {
              inactive: result.inactive,
              withoutConsent: result.withoutConsent,
              eligible: result.eligible,
              recentlyContacted: result.recentlyContacted,
              wouldSend: result.wouldSend,
            }
          : {}),
      });
    }
    if (mode === "apply") {
      const failed = results.reduce((sum, row) => sum + row.failed, 0);
      await recordJobRun("customer-reactivation", {
        ok: failed === 0,
        detail: `${results.reduce((sum, row) => sum + row.processed, 0)} correo(s) enviados, ${failed} con error`,
      });
    }
    return NextResponse.json({ mode, stores: results }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CUSTOMER_REACTIVATION_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
