import { handleErrorResponse } from "@/lib/api-errors";
import { handleCopilotChat } from "@/lib/copiloto/chat";
import { requireStoreOwner } from "@/lib/store-access";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Chat del copiloto en streaming (lib/copiloto/chat.ts). Solo la dueña. */
export async function POST(request: Request, { params }: { params: { storeId: string } }) {
  try {
    const userId = await requireStoreOwner(params.storeId);
    return await handleCopilotChat(request, params.storeId, { userId });
  } catch (error) {
    return handleErrorResponse(error, "COPILOTO_CHAT");
  }
}
