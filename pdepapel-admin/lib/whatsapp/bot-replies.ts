import prismadb from "@/lib/prismadb";
import type { WhatsAppBotKeyword } from "@/lib/whatsapp/bot-matching";
import { isBotReplySendable, parseStoredButtons, parseStoredTriggers } from "@/lib/whatsapp/bot-replies-shared";

export * from "@/lib/whatsapp/bot-replies-shared";

// --- Lectura para el bot ---------------------------------------------------

/**
 * Respuestas activas de la tienda, en el orden en que se prueban. Si no hay
 * ninguna, el bot no contesta nada: es el estado con el que nace la tabla.
 */
export async function getActiveBotKeywords(storeId: string): Promise<WhatsAppBotKeyword[]> {
  const replies = await prismadb.whatsAppBotReply.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      triggers: true,
      answer: true,
      buttons: true,
      approvedAt: true,
      isActive: true,
    },
  });

  return replies
    .filter((reply) => isBotReplySendable(reply))
    .map((reply) => ({
      id: reply.id,
      label: reply.label,
      triggers: parseStoredTriggers(reply.triggers),
      answer: reply.answer,
      buttons: parseStoredButtons(reply.buttons),
    }))
    .filter((reply) => reply.triggers.length > 0);
}

/**
 * Una respuesta concreta para mandarla tras tocar un botón. No pasa por los
 * disparadores —el botón ya dijo cuál es— pero sí por la regla de aprobación.
 */
export async function getSendableBotReply(
  storeId: string,
  replyId: string,
): Promise<WhatsAppBotKeyword | null> {
  const reply = await prismadb.whatsAppBotReply.findFirst({
    where: { id: replyId, storeId },
    select: {
      id: true,
      label: true,
      answer: true,
      buttons: true,
      approvedAt: true,
      isActive: true,
    },
  });
  if (!reply || !isBotReplySendable(reply)) return null;

  return {
    id: reply.id,
    label: reply.label,
    // Se llega por botón, no por frase.
    triggers: [],
    answer: reply.answer,
    buttons: parseStoredButtons(reply.buttons),
  };
}
