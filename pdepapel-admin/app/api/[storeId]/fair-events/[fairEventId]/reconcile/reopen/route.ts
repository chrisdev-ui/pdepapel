import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { reopenFairEvent } from "@/lib/fair-events";
import { verifyStoreOwner } from "@/lib/utils";

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    return NextResponse.json(
      await reopenFairEvent({
        storeId: params.storeId,
        fairEventId: params.fairEventId,
      }),
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_RECONCILE_REOPEN_POST");
  }
}
