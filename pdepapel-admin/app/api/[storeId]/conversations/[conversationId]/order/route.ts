import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { createOrderFromConversationCart } from "@/lib/whatsapp/cart-orders";

/**
 * Convierte el carrito de una conversación en un pedido en borrador. Solo la
 * dueña: el bot nunca crea pedidos, porque llegan sin dirección ni pago.
 */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; conversationId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.conversationId) {
      throw ErrorFactory.InvalidRequest("El ID de la conversación es requerido");
    }
    await verifyStoreOwner(userId, params.storeId);

    const result = await createOrderFromConversationCart({
      storeId: params.storeId,
      conversationId: params.conversationId,
      createdBy: userId,
    });

    return NextResponse.json(
      { orderId: result.orderId, existing: result.existing },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CONVERSATION_ORDER_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}
