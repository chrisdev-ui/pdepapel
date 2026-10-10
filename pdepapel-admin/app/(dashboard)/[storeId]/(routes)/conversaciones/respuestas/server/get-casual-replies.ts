import { requireStoreOwner } from "@/lib/store-access";
import { getStoreSettings } from "@/lib/store-settings";
import {
  areCasualRepliesApproved,
  previewCasualTemplates,
} from "@/lib/whatsapp/bot-casual";

import type { CasualRepliesPreview } from "../components/casual-replies-card";

export async function getCasualReplies(
  storeId: string,
): Promise<CasualRepliesPreview> {
  await requireStoreOwner(storeId);
  const settings = await getStoreSettings(storeId);
  return {
    approved: areCasualRepliesApproved(settings),
    approvedAt: settings.botCasualApprovedAt?.toISOString() ?? null,
    items: previewCasualTemplates(),
  };
}
