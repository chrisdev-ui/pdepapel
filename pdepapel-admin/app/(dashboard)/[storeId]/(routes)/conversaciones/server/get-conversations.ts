import { requireStoreOwner } from "@/lib/store-access";

import prismadb from "@/lib/prismadb";
import { parseCartMetadata, previewMessage, type ConversationRow } from "@/lib/conversations";

/**
 * Conversaciones de la tienda para la lista, con su último mensaje.
 * Función de servidor normal (sin `"use server"`): solo la llama la página.
 */
export async function getConversations(storeId: string): Promise<ConversationRow[]> {
  await requireStoreOwner(storeId);
  const conversations = await prismadb.conversation.findMany({
    where: { storeId },
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
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, mediaType: true, createdAt: true, metadata: true },
      },
    },
    // Lo más reciente arriba: es el orden en el que ella atiende.
    orderBy: [{ lastInboundAt: "desc" }, { createdAt: "desc" }],
  });

  return conversations.map(({ _count, messages, ...fields }) => {
    const last = messages[0] ?? null;
    return {
      ...fields,
      messageCount: _count.messages,
      lastMessagePreview: last ? previewMessage(last.body, last.mediaType) : null,
      lastMessageAt: last?.createdAt ?? null,
      hasCart: Boolean(last && parseCartMetadata(last.metadata)),
    };
  });
}
