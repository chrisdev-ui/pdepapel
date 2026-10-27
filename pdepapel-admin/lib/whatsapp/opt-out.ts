import {
  ConversationMessageDirection,
  ConversationMessageSentBy,
  ConversationMessageStatus,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";

/**
 * «BAJA» escrito en el chat: no quiere más avisos de sus pedidos por WhatsApp.
 *
 * Solo el mensaje entero: «¿tienen la carpeta baja?» es una pregunta por un
 * producto, no una baja. Se compara sin tildes, mayúsculas, signos ni emojis.
 */
const OPT_OUT_PHRASES = new Set([
  "baja",
  "stop",
  "no mas avisos",
  "no quiero mas avisos",
  "no mas avisos por favor",
  "darme de baja",
  "dar de baja",
  "quiero darme de baja",
]);

export function normalizeOptOutText(body: string): string {
  return body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOptOutMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  return OPT_OUT_PHRASES.has(normalizeOptOutText(body));
}

export const OPT_OUT_CONFIRMATION =
  "Listo 💛 Ya no te enviaremos avisos de tus pedidos por WhatsApp. Si cambias de opinión, escríbenos por aquí.";

/** Una sola confirmación por día aunque repita «BAJA». */
const CONFIRMATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Los diez últimos dígitos: el pedido guarda el teléfono como lo escribió la clienta (+57…, 57…, 3…). */
export function phoneTail(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Marca la baja en sus pedidos que aún no la tienen. Devuelve cuántos cambió. */
export async function recordWhatsAppOptOut(storeId: string, phone: string | null | undefined, at = new Date()): Promise<number> {
  const tail = phoneTail(phone);
  if (!tail) return 0;
  // Solo dígitos: hay pedidos con el teléfono escrito con espacios o guiones («300 123 4567»).
  const rows = await prismadb.$queryRaw<{ id: string }[]>`
    SELECT \`id\` FROM \`Order\`
     WHERE \`storeId\` = ${storeId} AND \`whatsappOptOutAt\` IS NULL
       AND REGEXP_REPLACE(COALESCE(\`phone\`, ''), '[^0-9]', '') LIKE ${`%${tail}`}`;
  if (rows.length === 0) return 0;
  const result = await prismadb.order.updateMany({
    where: { id: { in: rows.map((row) => row.id) }, whatsappOptOutAt: null },
    data: { whatsappOptOutAt: at },
  });
  return result.count;
}

export type OptOutOutcome = "opted_out" | "opted_out_already_confirmed";

/**
 * Anota la baja y contesta una vez. La confirmación sale aunque el bot esté
 * apagado o Paula en pausa: es la respuesta a una petición de la clienta, no
 * una venta. No pasa por los topes del bot.
 */
export async function handleOptOutMessage(input: {
  storeId: string;
  conversationId: string;
  recipient: string;
  customerPhone: string | null | undefined;
  now?: Date;
}): Promise<{ outcome: OptOutOutcome; ordersUpdated: number; error?: string }> {
  const now = input.now ?? new Date();
  const ordersUpdated = await recordWhatsAppOptOut(input.storeId, input.customerPhone ?? input.recipient, now);
  const recent = await prismadb.conversationMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.BOT,
      body: OPT_OUT_CONFIRMATION,
      createdAt: { gte: new Date(now.getTime() - CONFIRMATION_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recent) return { outcome: "opted_out_already_confirmed", ordersUpdated };

  const sent = await sendWhatsAppTextMessage(input.recipient, OPT_OUT_CONFIRMATION);
  await prismadb.conversationMessage.create({
    data: {
      conversationId: input.conversationId,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.BOT,
      externalId: sent.ok ? sent.externalId : null,
      body: OPT_OUT_CONFIRMATION,
      metadata: { kind: "opt_out", ordersUpdated },
      status: sent.ok ? ConversationMessageStatus.SENT : ConversationMessageStatus.FAILED,
      createdAt: now,
    },
  });
  if (sent.ok) {
    await prismadb.conversation.update({ where: { id: input.conversationId }, data: { lastOutboundAt: now } });
    return { outcome: "opted_out", ordersUpdated };
  }
  console.error("[WHATSAPP_OPT_OUT] No salió la confirmación de baja", { conversationId: input.conversationId, status: sent.status ?? null });
  return { outcome: "opted_out", ordersUpdated, error: sent.error };
}
