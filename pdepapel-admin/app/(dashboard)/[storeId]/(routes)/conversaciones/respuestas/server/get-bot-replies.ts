import prismadb from "@/lib/prismadb";
import { parseStoredTriggers, type BotReplyRow } from "@/lib/whatsapp/bot-replies";

/**
 * Respuestas automáticas de la tienda, en el orden en que el bot las prueba.
 * Función de servidor normal (sin `"use server"`): solo la llama la página.
 */
export async function getBotReplies(storeId: string): Promise<BotReplyRow[]> {
  const replies = await prismadb.whatsAppBotReply.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      triggers: true,
      answer: true,
      isActive: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  return replies.map((reply) => ({
    ...reply,
    triggers: parseStoredTriggers(reply.triggers),
  }));
}

export async function getBotReply(
  storeId: string,
  botReplyId: string,
): Promise<BotReplyRow | null> {
  const reply = await prismadb.whatsAppBotReply.findFirst({
    where: { id: botReplyId, storeId },
    select: {
      id: true,
      label: true,
      triggers: true,
      answer: true,
      isActive: true,
      sortOrder: true,
      updatedAt: true,
    },
  });
  if (!reply) return null;
  return { ...reply, triggers: parseStoredTriggers(reply.triggers) };
}
