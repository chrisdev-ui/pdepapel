import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { isShipmentMilestone } from "@/lib/shipment-milestones";
import { notifyShipmentMilestone } from "@/lib/shipment-notifications";
import { CACHE_HEADERS } from "@/lib/utils";

/** «Reenviar» un aviso de envío desde el pedido: mismo correo (y WhatsApp si aplica), fila nueva con quién lo pidió. */
export async function POST(request: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await requireJsonBody(request, "ORDER_NOTIFICATION_RESEND")) as { milestone?: unknown };
    const milestone = typeof body.milestone === "string" && isShipmentMilestone(body.milestone) ? body.milestone : null;
    if (!milestone) throw ErrorFactory.InvalidRequest("Aviso no válido");

    const order = await prismadb.order.findFirst({ where: { id: params.orderId, storeId: params.storeId }, select: { id: true } });
    if (!order) throw ErrorFactory.NotFound("El pedido no existe");

    const result = await notifyShipmentMilestone({ orderId: order.id, storeId: params.storeId, milestone, source: "reenviar del panel", force: true, createdBy: userId });
    if (result.skipped) throw ErrorFactory.Conflict(`No se puede avisar: ${result.skipped}.`);
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_NOTIFICATION_RESEND");
  }
}
