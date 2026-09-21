import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import {
  parseCartMetadata,
  resolveCart,
  type ConversationDetail,
} from "@/lib/conversations";

/**
 * Una conversación con todo su hilo. Los carritos se resuelven contra el
 * catálogo de ahora, así que el precio y las existencias que ve la dueña son
 * los de hoy, no los del día en que la clienta armó el carrito.
 *
 * Solo la dueña: el hilo trae el teléfono, el nombre y todo lo que se
 * escribieron. La lista de Conversaciones ya estaba cerrada, pero el detalle
 * se quedó abierto: con el id de una conversación se leía entera.
 */
export async function getConversation(
  storeId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  await requireStoreOwner(storeId);
  const conversation = await prismadb.conversation.findFirst({
    where: { id: conversationId, storeId },
    select: {
      id: true,
      phone: true,
      bsuid: true,
      username: true,
      contactName: true,
      status: true,
      lastInboundAt: true,
      lastOutboundAt: true,
      orderId: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          sentBy: true,
          status: true,
          body: true,
          mediaType: true,
          createdAt: true,
          metadata: true,
        },
      },
    },
  });

  if (!conversation) return null;

  const carts = conversation.messages.map((message) => parseCartMetadata(message.metadata));
  const skus = Array.from(new Set(carts.flatMap((cart) => cart?.map((item) => item.sku) ?? [])));
  const products = skus.length
    ? await prismadb.product.findMany({
        where: { storeId, sku: { in: skus } },
        select: { id: true, name: true, sku: true, price: true, stock: true, isArchived: true },
      })
    : [];

  const { messages, ...fields } = conversation;
  return {
    ...fields,
    messages: messages.map(({ metadata: _metadata, ...message }, index) => ({
      ...message,
      cart: carts[index] ? resolveCart(carts[index]!, products) : null,
    })),
  };
}
