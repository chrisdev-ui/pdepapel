import { ConversationMessageDirection, ConversationMessageSentBy, Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import type { OrderRequestRecord } from "@/lib/whatsapp/bot-order-request";

/**
 * Dónde queda el pedido que el bot le pasa a Paula: en la respuesta del bot
 * o, si esa respuesta no llegó a salir, en el mensaje de la clienta.
 */

/** El último pedido anotado en la conversación antes de `before`, en cualquier mensaje. */
export async function latestOrderRequest(conversationId: string, before: Date) {
  const row = await prismadb.conversationMessage.findFirst({
    where: {
      conversationId,
      createdAt: { lt: before },
      metadata: { path: "$.orderRequest", not: Prisma.AnyNull },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, sentBy: true, createdAt: true, metadata: true },
  });
  const record = (row?.metadata as { orderRequest?: OrderRequestRecord } | null)?.orderRequest;
  return row && record ? { id: row.id, fromBot: row.sentBy === ConversationMessageSentBy.BOT, createdAt: row.createdAt, record } : null;
}

/**
 * La respuesta no salió (la clienta o Paula escribieron en la pausa), pero el
 * pedido ya estaba entendido y la conversación ya es de Paula: se anota en el
 * mensaje de la clienta para que la tarjeta aparezca igual. No reemplaza un
 * pedido ya anotado ahí, así un reintento no lo duplica ni lo cambia.
 */
export async function keepOrderRequestOnInbound(
  conversationId: string,
  inbound: { externalId: string | null; at: Date | null },
  record: OrderRequestRecord,
): Promise<boolean> {
  const row = await prismadb.conversationMessage.findFirst({
    where: {
      conversationId,
      direction: ConversationMessageDirection.INBOUND,
      ...(inbound.externalId ? { externalId: inbound.externalId } : inbound.at ? { createdAt: { lte: inbound.at } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, metadata: true },
  });
  if (!row) return false;
  const metadata = (row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {}) as Record<string, unknown>;
  if (metadata.orderRequest) return false;
  await prismadb.conversationMessage.update({
    where: { id: row.id },
    data: { metadata: { ...metadata, orderRequest: record } as unknown as Prisma.InputJsonValue },
  });
  return true;
}
