import { auth } from "@clerk/nextjs/server";
import { WhatsAppOptInSource } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { canRecordChatOptIn, WHATSAPP_OPT_IN_VERSION } from "@/lib/whatsapp-opt-in";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Avisos por WhatsApp de un pedido, desde el panel:
 * - `record`: la clienta los pidió en el chat. Solo pedidos nacidos en WhatsApp;
 *   queda quién lo anotó y cuándo.
 * - `remove`: pidió no recibirlos (o se anotó por error). No se borra el
 *   consentimiento: se marca la baja.
 */
export async function POST(request: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = (await requireJsonBody(request, "ORDER_WHATSAPP_OPT_IN")) as { action?: unknown };
    const action = body.action === "record" || body.action === "remove" ? body.action : null;
    if (!action) throw ErrorFactory.InvalidRequest("Acción no válida: usa «record» o «remove»");

    const order = await prismadb.order.findFirst({
      where: { id: params.orderId, storeId: params.storeId },
      select: { id: true, source: true, phone: true, whatsappOptInAt: true, conversations: { where: { channel: "WHATSAPP" }, select: { id: true }, take: 1 } },
    });
    if (!order) throw ErrorFactory.NotFound("El pedido no existe");

    if (action === "remove") {
      if (!order.whatsappOptInAt) throw ErrorFactory.Conflict("Este pedido no tiene avisos por WhatsApp.");
      await prismadb.order.update({ where: { id: order.id }, data: { whatsappOptOutAt: new Date() } });
      return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
    }

    if (!canRecordChatOptIn({ source: order.source, hasWhatsAppConversation: order.conversations.length > 0 })) {
      throw ErrorFactory.Conflict("Solo se anota en pedidos que llegaron por WhatsApp; en la tienda la clienta marca la casilla.");
    }
    if (!order.phone?.trim()) throw ErrorFactory.Conflict("El pedido no tiene teléfono.");
    await prismadb.order.update({
      where: { id: order.id },
      data: {
        whatsappOptInAt: new Date(),
        whatsappOptInVersion: WHATSAPP_OPT_IN_VERSION,
        whatsappOptInSource: WhatsAppOptInSource.PANEL_CHAT,
        whatsappOptInBy: userId,
        whatsappOptOutAt: null,
      },
    });
    return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_WHATSAPP_OPT_IN");
  }
}
