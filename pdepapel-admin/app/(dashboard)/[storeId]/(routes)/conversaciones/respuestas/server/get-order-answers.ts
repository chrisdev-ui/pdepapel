import { requireStoreOwner } from "@/lib/store-access";
import { getStoreSettings } from "@/lib/store-settings";
import { areOrderRepliesApproved, previewOrderTemplates } from "@/lib/whatsapp/bot-order-request";
import { formatCOP } from "@/lib/whatsapp/bot-products";

import type { ProductAnswersPreview } from "../components/product-answers-card";

export async function getOrderAnswers(storeId: string): Promise<ProductAnswersPreview> {
  await requireStoreOwner(storeId);
  const settings = await getStoreSettings(storeId);
  return {
    approved: areOrderRepliesApproved(settings),
    approvedAt: settings.botCasualApprovedAt?.toISOString() ?? null,
    items: previewOrderTemplates(formatCOP),
  };
}
