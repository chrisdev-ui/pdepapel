import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { startFairReconciliation } from "@/lib/fair-events";
import { requireStoreOwner } from "@/lib/store-access";

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const userId = await requireStoreOwner(params.storeId);

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
