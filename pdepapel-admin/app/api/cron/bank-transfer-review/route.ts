import { NextResponse, type NextRequest } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";
import {
  applyBankTransferReview,
  planBankTransferReview,
  resolveScheduledJobMode,
  summarizeBankTransferPlan,
} from "@/lib/scheduled-jobs";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Marca para revisión los pedidos por transferencia sin pagar después de
 * 48 h, agregando un aviso a las notas internas. No cancela ni avisa a la
 * clienta. Apagado (`SCHEDULED_JOBS`): sin `mode=apply` solo cuenta.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();
    const mode = resolveScheduledJobMode(request.url, "bank-transfer-review");

    const stores = await prismadb.store.findMany({ select: { id: true } });
    const results = [];
    for (const store of stores) {
      const plan = await planBankTransferReview(store.id);
      const flagged = mode === "apply" ? await applyBankTransferReview(store.id, plan) : 0;
      results.push({ ...summarizeBankTransferPlan(plan), flagged });
    }
    if (mode === "apply") {
      await recordJobRun("bank-transfer-review", {
        ok: true,
        detail: `${results.reduce((sum, row) => sum + row.flagged, 0)} pedido(s) marcados para revisión`,
      });
    }
    return NextResponse.json({ mode, stores: results }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "BANK_TRANSFER_REVIEW_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
