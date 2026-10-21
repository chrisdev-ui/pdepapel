import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { recordSuggestionFeedback } from "@/lib/capsule-suggestion-data";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** El ✓/✗ de Paula a una edición sugerida o a un producto de su bolsa. */
export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await req.json().catch(() => null);
    return NextResponse.json({ feedback: await recordSuggestionFeedback({ storeId: params.storeId, userId, body }) }, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_SUGGESTION_FEEDBACK_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404] });
  }
}
