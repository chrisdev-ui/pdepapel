import { env } from "@/lib/env.mjs";

/**
 * Quién puede dar el visto bueno a un menú del bot.
 *
 * `WHATSAPP_BOT_APPROVER_USER_ID` nombra a esa persona por su id de Clerk.
 * Sin la variable aprueba cualquier dueño de la tienda, que es como funcionaba
 * antes de esto: así el panel no se rompe si la variable falta.
 *
 * Ojo con lo que esto sí y no separa: la puerta de entrada al panel sigue
 * siendo `verifyStoreOwner`. Si la tienda tiene una sola cuenta de dueña,
 * fijar esta variable a esa misma cuenta no separa a nadie de nadie; empieza a
 * significar algo el día que haya una segunda cuenta con acceso.
 */
export function getBotReplyApproverUserId(): string | null {
  return env.WHATSAPP_BOT_APPROVER_USER_ID?.trim() || null;
}

export function canApproveBotReplies(userId: string | null | undefined): boolean {
  const approver = getBotReplyApproverUserId();
  if (!approver) return true;
  return Boolean(userId) && userId === approver;
}
