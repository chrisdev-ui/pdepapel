import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { getCapsuleDraw } from "@/lib/capsule-orders";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

export async function GET(_req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(await getCapsuleDraw(params.storeId, params.orderId), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_ORDER_GET", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404, 409] });
  }
}
