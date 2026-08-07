import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { allocateFairInventory } from "@/lib/fair-events";
import { verifyStoreOwner } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const { allocations } = await req.json();
    if (!Array.isArray(allocations)) {
      throw ErrorFactory.InvalidRequest("Las asignaciones deben ser una lista");
    }

    await allocateFairInventory({
      storeId: params.storeId,
      fairEventId: params.fairEventId,
      allocations,
      userId,
    });
    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_ALLOCATION_POST");
  }
}
