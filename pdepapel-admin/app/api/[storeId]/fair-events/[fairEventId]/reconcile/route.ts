import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { reconcileFairEvent } from "@/lib/fair-events";
import { verifyStoreOwner } from "@/lib/utils";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const { items } = await req.json();
    if (!Array.isArray(items)) {
      throw ErrorFactory.InvalidRequest(
        "La conciliación debe incluir los productos",
      );
    }

    const fairEvent = await reconcileFairEvent({
      storeId: params.storeId,
      fairEventId: params.fairEventId,
      items,
      userId,
    });
    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(fairEvent);
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_RECONCILE_POST");
  }
}
