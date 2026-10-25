import { NextRequest, NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { requireCronAuth } from "@/lib/cron-auth";
import { recordJobRun } from "@/lib/job-runs";
import { deleteExpiredPendingNewsletterSignups } from "@/lib/newsletter-retention";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const result = await deleteExpiredPendingNewsletterSignups(prismadb);
    await recordJobRun("newsletter-retention", {
      ok: true,
      detail: `${result.deleted} alta(s) del boletín sin confirmar eliminadas (más de ${result.olderThanDays} días)`,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    await recordJobRun("newsletter-retention", {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
    return handleErrorResponse(error, "NEWSLETTER_RETENTION_CRON", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
