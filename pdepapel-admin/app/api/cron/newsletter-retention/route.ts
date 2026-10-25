import { NextRequest, NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import { deleteExpiredPendingNewsletterSignups } from "@/lib/newsletter-retention";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("authorization")?.split("Bearer ").at(1);
    if (!token || token !== env.CRON_SECRET) throw ErrorFactory.Unauthorized();

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
