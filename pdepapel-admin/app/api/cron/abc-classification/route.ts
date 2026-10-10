import { NextResponse, type NextRequest } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";
import {
  applyAbcClassification,
  planAbcClassification,
  resolveScheduledJobMode,
  summarizeAbcPlan,
} from "@/lib/scheduled-jobs";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Clasificación ABC por utilidad de los últimos 180 días. Apagada
 * (`SCHEDULED_JOBS`): sin `mode=apply` solo cuenta lo que cambiaría.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();
    const mode = resolveScheduledJobMode(request.url, "abc-classification");

    const stores = await prismadb.store.findMany({ select: { id: true } });
    const results = [];
    for (const store of stores) {
      const plan = await planAbcClassification(store.id);
      const updated = mode === "apply" ? await applyAbcClassification(store.id, plan) : 0;
      results.push({ ...summarizeAbcPlan(plan), updated });
    }
    if (mode === "apply") {
      await recordJobRun("abc-classification", {
        ok: true,
        detail: `${results.reduce((sum, row) => sum + row.updated, 0)} producto(s) cambiaron de clase`,
      });
    }
    return NextResponse.json({ mode, stores: results }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ABC_CLASSIFICATION_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
