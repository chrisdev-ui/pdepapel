import { requireStoreOwner } from "@/lib/store-access";

import { ConversationMessageSentBy } from "@prisma/client";

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

  // Una sola consulta para toda la lista: son pocas filas y se cruzan en
  // memoria. Preguntar por conversación sería una consulta por fila.
  const ignorados = await prismadb.ignoredContact.findMany({
    where: { storeId },
    select: { phone: true, bsuid: true, skippedCount: true },
  });
  // Pedidos que el bot pasó y siguen sin descartar: una consulta para toda la lista.
  const conPedido = new Set(
    (
      await prismadb.conversationMessage.findMany({
        where: {
          conversation: { storeId },
          sentBy: ConversationMessageSentBy.BOT,
          metadata: { path: "$.orderRequest.status", equals: "pending" },
        },
        select: { conversationId: true },
      })
    ).map((message) => message.conversationId),
  );
  const desdeLaWeb = new Set(
    (
      await prismadb.conversationMessage.findMany({
        where: {
          conversation: { storeId },
          sentBy: ConversationMessageSentBy.CUSTOMER,
          metadata: { path: "$.webOrigin.source", equals: "web" },
        },
        select: { conversationId: true },
        distinct: ["conversationId"],
      })
    ).map((message) => message.conversationId),
  );
  const porTelefono = new Map(ignorados.filter((i) => i.phone).map((i) => [i.phone as string, i]));
  const porBsuid = new Map(ignorados.filter((i) => i.bsuid).map((i) => [i.bsuid as string, i]));

  return conversations.map(({ _count, messages, ...fields }) => {
    const last = messages[0] ?? null;
    // Exacto por teléfono o por BSUID, nunca por parecido.
    const ignorado =
      (fields.phone ? porTelefono.get(fields.phone) : undefined) ??
      (fields.bsuid ? porBsuid.get(fields.bsuid) : undefined);
    return {
      ...fields,
      messageCount: _count.messages,
      lastMessagePreview: last ? previewMessage(last.body, last.mediaType) : null,
      lastMessageAt: last?.createdAt ?? null,
      hasCart: Boolean(last && parseCartMetadata(last.metadata)),
      ignored: Boolean(ignorado),
      skippedCount: ignorado?.skippedCount ?? 0,
      pendingOrder: conPedido.has(fields.id),
      fromWeb: desdeLaWeb.has(fields.id),
    };
  });
}
