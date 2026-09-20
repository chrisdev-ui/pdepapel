import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { reopenFairEvent } from "@/lib/fair-events";
import { requireStoreOwner } from "@/lib/store-access";

export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const userId = await requireStoreOwner(params.storeId);

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
