import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { listCapsuleQueue } from "@/lib/capsule-orders";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Pedidos de cápsulas pagados: por sacar, sacados y su video. Solo la dueña (costo provisional y real). */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json({ orders: await listCapsuleQueue(params.storeId) }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_ORDERS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
