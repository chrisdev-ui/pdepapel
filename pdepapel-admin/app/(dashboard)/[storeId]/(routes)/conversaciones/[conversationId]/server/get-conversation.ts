import prismadb from "@/lib/prismadb";
import { requireStoreOwner } from "@/lib/store-access";
import {
  parseCartMetadata,
  parseOrderRequestMetadata,
  parseTapMetadata,
  parseWebOriginMetadata,
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
      lastOwnerAt: true,
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

  // Contexto de la tienda web: los SKU y el pedido se buscan en esta tienda; un
  // pedido que no existe no se enseña.
  const origins = conversation.messages.map((message) => parseWebOriginMetadata(message.metadata));
  const webSkus = Array.from(new Set(origins.flatMap((origin) => origin?.refs ?? [])));
  const webOrderNumbers = Array.from(new Set(origins.flatMap((origin) => (origin?.orderNumber ? [origin.orderNumber] : []))));
  const [webProducts, webOrders] = await Promise.all([
    webSkus.length
      ? prismadb.product.findMany({ where: { storeId, sku: { in: webSkus } }, select: { id: true, sku: true, name: true } })
      : Promise.resolve([]),
    webOrderNumbers.length
      ? prismadb.order.findMany({ where: { storeId, orderNumber: { in: webOrderNumbers } }, select: { id: true, orderNumber: true } })
      : Promise.resolve([]),
  ]);

  // Exacto por teléfono o por BSUID; nunca por parecido.
  const ignorado =
    conversation.phone || conversation.bsuid
      ? await prismadb.ignoredContact.findFirst({
          where: {
            storeId,
            OR: [
              ...(conversation.phone ? [{ phone: conversation.phone }] : []),
              ...(conversation.bsuid ? [{ bsuid: conversation.bsuid }] : []),
            ],
          },
          select: { skippedCount: true },
        })
      : null;

  const { messages, ...fields } = conversation;
  return {
    ...fields,
    ignored: Boolean(ignorado),
    skippedCount: ignorado?.skippedCount ?? 0,
    messages: messages.map(({ metadata, ...message }, index) => ({
      ...message,
      cart: carts[index] ? resolveCart(carts[index]!, products) : null,
      tappedOptionId: parseTapMetadata(metadata),
      orderRequest: parseOrderRequestMetadata(metadata),
      webOrigin: origins[index]
        ? {
            pageType: origins[index]!.pageType,
            legacy: origins[index]!.legacy,
            products: origins[index]!.refs.map((sku) => {
              const product = webProducts.find((row) => row.sku === sku);
              return { sku, name: product?.name ?? null, productId: product?.id ?? null };
            }),
            order: webOrders.find((row) => row.orderNumber === origins[index]!.orderNumber) ?? null,
          }
        : null,
    })),
  };
}
