import { subDays } from "date-fns";

import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import { SHADOW_REPORT_DAYS, summarizeShadowRuns, type ShadowReport } from "@/lib/whatsapp/shadow/report";

export async function getShadowReport(storeId: string): Promise<ShadowReport> {
  await requireStoreOwner(storeId);
  const rows = await prismadb.whatsAppBotShadowRun.findMany({
    where: { storeId, createdAt: { gte: subDays(new Date(), SHADOW_REPORT_DAYS) } },
    select: {
      intent: true,
      plannedCount: true,
      realCount: true,
      realOutcome: true,
      productsFound: true,
      classifierStatus: true,
      skipReason: true,
    },
    take: 5000,
  });
  return summarizeShadowRuns(rows);
}
