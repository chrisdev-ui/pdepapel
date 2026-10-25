import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { recordSuggestionFeedback } from "@/lib/capsule-suggestion-data";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { requireJsonBody } from "@/lib/request-body";

/** El ✓/✗ de Paula a una edición sugerida o a un producto de su bolsa. */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await requireJsonBody(req, "CAPSULE_SUGGESTION_FEEDBACK_POST");
    return NextResponse.json({ feedback: await recordSuggestionFeedback({ storeId: params.storeId, userId, body }) }, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SUGGESTION_FEEDBACK_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404] });
  }
}
