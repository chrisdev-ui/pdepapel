import { requireStoreOwner } from "@/lib/store-access";

import {
  areProductAnswersApproved,
  previewProductTemplates,
} from "@/lib/whatsapp/bot-products";
import { getStoreSettings } from "@/lib/store-settings";

import type { ProductAnswersPreview } from "../components/product-answers-card";

export async function getProductAnswers(
  storeId: string,
): Promise<ProductAnswersPreview> {
  await requireStoreOwner(storeId);
  const settings = await getStoreSettings(storeId);
  return {
    approved: areProductAnswersApproved(settings),
    approvedAt: settings.botProductsApprovedAt?.toISOString() ?? null,
    items: previewProductTemplates(),
  };
}
