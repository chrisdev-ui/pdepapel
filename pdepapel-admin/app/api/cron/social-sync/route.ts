import { NextResponse, type NextRequest } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { resolveScheduledJobMode } from "@/lib/scheduled-jobs";
import { planSocialSync, startSocialSync, type PlatformFilter } from "@/lib/social/runner";
import { CACHE_HEADERS } from "@/lib/utils";
import { safeSecretEquals } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const PLATFORMS: PlatformFilter[] = ["all", "instagram", "tiktok"];

/**
 * `social-sync.yml` (cada 6 h). Responde enseguida: con `mode=apply` encola
 * una tarea por cuenta en QStash; sin él (o con el trabajo apagado) solo
 * cuenta, sin llamar a Meta ni a TikTok.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!safeSecretEquals(token, env.CRON_SECRET)) throw ErrorFactory.Unauthorized();
    const platform = (new URL(request.url).searchParams.get("platform") ?? "all") as PlatformFilter;
    if (!PLATFORMS.includes(platform)) throw ErrorFactory.InvalidRequest("platform debe ser all, instagram o tiktok");
    const mode = resolveScheduledJobMode(request.url, "social-sync");

    if (mode === "apply") {
      return NextResponse.json({ mode, platform, ...(await startSocialSync(platform)) }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    return NextResponse.json({ mode, platform, accounts: await planSocialSync(platform) }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "SOCIAL_SYNC_CRON", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
