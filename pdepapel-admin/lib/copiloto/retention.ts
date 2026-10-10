import prismadb from "@/lib/prismadb";

/**
 * Las conversaciones del copiloto sin actividad en 180 días se borran con sus
 * mensajes. Las notas de conocimiento (`AssistantKnowledgeNote`) nunca se tocan.
 */
export const COPILOT_CONVERSATION_RETENTION_DAYS = 180;
const BATCH = 200;

export interface CopilotRetentionResult {
  conversations: number;
  messages: number;
  olderThanDays: number;
  cutoff: Date;
}

export function copilotRetentionCutoff(now: Date, olderThanDays = COPILOT_CONVERSATION_RETENTION_DAYS) {
  return new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);
}

/** Cuenta lo que se borraría, sin escribir nada. */
export async function planCopilotRetention(now: Date = new Date()): Promise<CopilotRetentionResult> {
  const cutoff = copilotRetentionCutoff(now);
  const where = { lastMessageAt: { lt: cutoff } };
  const [conversations, messages] = await Promise.all([
    prismadb.assistantConversation.count({ where }),
    prismadb.assistantMessage.count({ where: { conversation: where } }),
  ]);
  return { conversations, messages, olderThanDays: COPILOT_CONVERSATION_RETENTION_DAYS, cutoff };
}

/**
 * Borra por lotes: primero los mensajes y luego la conversación, en la misma
 * transacción (sin llaves foráneas, `relationMode = "prisma"`). Ambos vuelven a
 * exigir el corte, por si alguien retomó la conversación entre la lectura y el borrado.
 */
export async function applyCopilotRetention(now: Date = new Date()): Promise<CopilotRetentionResult> {
  const cutoff = copilotRetentionCutoff(now);
  let conversations = 0;
  let messages = 0;
  for (;;) {
    const ids = (
      await prismadb.assistantConversation.findMany({
        where: { lastMessageAt: { lt: cutoff } },
        select: { id: true },
        take: BATCH,
      })
    ).map((row) => row.id);
    if (ids.length === 0) break;
    const [deletedMessages, deletedConversations] = await prismadb.$transaction([
      prismadb.assistantMessage.deleteMany({ where: { conversation: { id: { in: ids }, lastMessageAt: { lt: cutoff } } } }),
      prismadb.assistantConversation.deleteMany({ where: { id: { in: ids }, lastMessageAt: { lt: cutoff } } }),
    ]);
    messages += deletedMessages.count;
    conversations += deletedConversations.count;
    if (ids.length < BATCH) break;
  }
  return { conversations, messages, olderThanDays: COPILOT_CONVERSATION_RETENTION_DAYS, cutoff };
}
