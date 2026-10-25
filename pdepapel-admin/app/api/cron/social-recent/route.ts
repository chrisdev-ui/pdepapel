import { NextResponse, type NextRequest } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { resolveScheduledJobMode, scheduledRequestUrl } from "@/lib/scheduled-jobs";
import { runRecentRefresh } from "@/lib/social/runner";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron de Vercel cada hora (vercel.json): mide lo publicado en las últimas 8 h
 * para tener lecturas a las 2–6 h. Vercel manda el CRON_SECRET como Bearer y
 * el encabezado `x-vercel-cron-schedule`: con él corre en serio (la ruta del
 * cron no lleva `?mode=apply` porque la documentación no garantiza que Vercel
 * conserve la consulta). Una llamada a mano sin `mode=apply`, o con el trabajo
 * apagado, no llama a Meta ni a TikTok.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const mode = resolveScheduledJobMode(scheduledRequestUrl(request), "social-recent");
    if (mode !== "apply") return NextResponse.json({ mode }, { headers: CACHE_HEADERS.NO_CACHE });
    const result = await runRecentRefresh();
    console.info("[SOCIAL_RECENT]", { accounts: result.accounts, results: result.results });
    return NextResponse.json({ mode, ...result }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_RECENT_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
