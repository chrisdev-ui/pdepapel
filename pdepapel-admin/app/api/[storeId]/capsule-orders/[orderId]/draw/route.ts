import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { drawCapsuleSlip } from "@/lib/capsule-slips";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { requireJsonBody } from "@/lib/request-body";

/**
 * Saca un papel o regalo por su código (escaneado o escrito). El mismo código
 * dos veces responde 409. Solo la dueña. No invalida cachés: libera 1 apartado
 * y baja 1 de stock, así que lo disponible no cambia, y es el camino de cada
 * escaneo.
 */
export async function POST(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await requireJsonBody(req, "CAPSULE_ORDER_DRAW");
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) throw ErrorFactory.InvalidRequest("Escanea o escribe el código del papel");
    const result = await drawCapsuleSlip({ storeId: params.storeId, orderId: params.orderId, code, userId });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_ORDER_DRAW", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
