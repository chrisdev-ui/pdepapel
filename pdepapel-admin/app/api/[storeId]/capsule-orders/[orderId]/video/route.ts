import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { updateCapsuleVideo } from "@/lib/capsule-orders";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { requireJsonBody } from "@/lib/request-body";

/** Avanza el video del pedido (un paso a la vez) o guarda su enlace. Publicar exige el permiso de la clienta. Solo la dueña. */
export async function PATCH(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await requireJsonBody(req, "CAPSULE_ORDER_VIDEO");
    if (!body || typeof body !== "object") throw ErrorFactory.InvalidRequest("Datos del video inválidos");
    const updated = await updateCapsuleVideo({ storeId: params.storeId, orderId: params.orderId, videoStatus: body.videoStatus, videoUrl: body.videoUrl });
    return NextResponse.json({ videoStatus: updated.videoStatus, videoUrl: updated.videoUrl }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CAPSULE_ORDER_VIDEO", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
