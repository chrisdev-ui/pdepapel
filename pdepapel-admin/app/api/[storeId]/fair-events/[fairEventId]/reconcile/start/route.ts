import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { startFairReconciliation } from "@/lib/fair-events";
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
      await startFairReconciliation({
        storeId: params.storeId,
        fairEventId: params.fairEventId,
      }),
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_RECONCILE_START_POST");
  }
}
