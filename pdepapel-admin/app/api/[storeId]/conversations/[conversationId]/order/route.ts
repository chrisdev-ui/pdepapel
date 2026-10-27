import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { createOrderFromConversationCart, findLatestCart } from "@/lib/whatsapp/cart-orders";
import { createWhatsAppDraftOrder } from "@/lib/whatsapp/draft-orders";

/**
 * «Crear pedido» en una conversación: con carrito del catálogo, el borrador
 * sale del carrito; sin carrito, un borrador vacío ligado a la conversación
 * (con su teléfono, o sin él si la clienta solo tiene nombre de usuario) que
 * Paula completa en el panel. Solo la dueña: el bot nunca crea pedidos.
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

    const found = await findLatestCart(params.storeId, params.conversationId);
    if (!found) throw ErrorFactory.NotFound("La conversación no existe en esta tienda");
    const result = found.items
      ? await createOrderFromConversationCart({
          storeId: params.storeId,
          conversationId: params.conversationId,
          createdBy: userId,
        })
      : await createWhatsAppDraftOrder({
          storeId: params.storeId,
          conversationId: params.conversationId,
          origin: "conversaciones",
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
