import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { completeCapsuleDraw } from "@/lib/capsule-orders";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Cierra el sorteo: costo real, finanzas del pedido, caja sugerida y la guía en segundo plano. Una sola vez. Solo la dueña. */
export async function POST(_req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return NextResponse.json(await completeCapsuleDraw({ storeId: params.storeId, orderId: params.orderId }), { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_ORDER_FINISH", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
