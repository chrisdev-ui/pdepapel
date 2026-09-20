import { requireStoreOwner } from "@/lib/store-access";

import {
  areBusinessFactsApproved,
  previewBusinessFacts,
} from "@/lib/whatsapp/bot-facts";
import { getStoreSettings } from "@/lib/store-settings";

import type { BusinessFactsPreview } from "../components/business-facts-card";

export async function getBusinessFacts(
  storeId: string,
): Promise<BusinessFactsPreview> {
  await requireStoreOwner(storeId);
  const settings = await getStoreSettings(storeId);
  return {
    approved: areBusinessFactsApproved(settings),
    approvedAt: settings.botFactsApprovedAt?.toISOString() ?? null,
    items: previewBusinessFacts(settings),
  };
}
