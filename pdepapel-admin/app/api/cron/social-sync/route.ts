import { NextResponse, type NextRequest } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { resolveScheduledJobMode, scheduledRequestUrl } from "@/lib/scheduled-jobs";
import { planSocialSync, startSocialSync, type PlatformFilter } from "@/lib/social/runner";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PLATFORMS: PlatformFilter[] = ["all", "instagram", "tiktok"];

/**
 * Cron de Vercel cada 6 h (vercel.json, 03:15/09:15/15:15/21:15 UTC; antes
 * GitHub Actions, que llegaba a correr 5 h tarde). Vercel manda el CRON_SECRET
 * como Bearer y el encabezado `x-vercel-cron-schedule`: con él corre en serio,
 * sin consulta en la ruta. Responde enseguida: encola una tarea por cuenta en
 * QStash. Una llamada a mano (`social-sync.yml`, solo workflow_dispatch) sin
 * `mode=apply`, o con el trabajo apagado, solo cuenta, sin llamar a Meta ni a TikTok.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const platform = (url.searchParams.get("platform") ?? "all") as PlatformFilter;
    if (!PLATFORMS.includes(platform)) throw ErrorFactory.InvalidRequest("platform debe ser all, instagram o tiktok");
    const mode = resolveScheduledJobMode(scheduledRequestUrl(request), "social-sync");

    if (mode === "apply") {
      const result = await startSocialSync(platform);
      console.info("[SOCIAL_SYNC]", { platform, ...result });
      return NextResponse.json({ mode, platform, ...result }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    return NextResponse.json({ mode, platform, accounts: await planSocialSync(platform) }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_SYNC_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
