import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getFairEventDetail } from "@/lib/fair-events";
import { verifyStoreOwner } from "@/lib/utils";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    return NextResponse.json(
      await getFairEventDetail(params.storeId, params.fairEventId),
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_GET");
  }
}
