import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { claimWindow } from "@/lib/whatsapp/recovery";
import { countWaitingConversations } from "@/lib/whatsapp/waiting-list";
import { REMINDER_AFTER_MS, REMINDER_MAX_WAIT_MS, WAITING_REMINDER_EMAIL_ENABLED, isReminderHours, waitingReminderEmail } from "@/lib/whatsapp/waiting";

export const WAITING_REMINDER_EVERY_MS = 60 * 60 * 1000;
export const WAITING_CHECK_EVERY_MS = 10 * 60 * 1000;
/** Fila fija de `JobRun` por tienda: como mucho un correo por hora. */
export const waitingReminderRow = (storeId: string) => `whatsapp-waiting:alert:${storeId}`;

export interface WaitingReminderDeps {
  send?: (input: { storeId: string; count: number }) => Promise<void>;
  enabled?: boolean;
}

/**
 * Correo a Paula cuando una clienta lleva más de 30 min (y menos de un día)
 * esperándola, de 08:00 a 22:59 en Bogotá y como mucho uno por hora. Solo la
 * cuenta y el enlace a
 * la lista filtrada: ni nombres, ni teléfonos, ni texto de mensajes.
 */
export async function maybeSendWaitingReminder(storeId: string, now = new Date(), deps: WaitingReminderDeps = {}): Promise<{ sent: boolean; count: number }> {
  if (!(deps.enabled ?? WAITING_REMINDER_EMAIL_ENABLED) || !isReminderHours(now)) return { sent: false, count: 0 };
  // Contar lee unas cuantas conversaciones: como mucho una vez cada 10 min por tienda.
  if (!(await claimWindow(`whatsapp-waiting:check:${storeId}`, WAITING_CHECK_EVERY_MS, now))) return { sent: false, count: 0 };
  const count = await countWaitingConversations(storeId, now, REMINDER_AFTER_MS, REMINDER_MAX_WAIT_MS);
  if (count === 0) return { sent: false, count };
  if (!(await claimWindow(waitingReminderRow(storeId), WAITING_REMINDER_EVERY_MS, now))) return { sent: false, count };
  await (deps.send ?? sendWaitingReminder)({ storeId, count }).catch((error: unknown) => {
    console.error("[WHATSAPP_WAITING] No se pudo enviar el recordatorio", { message: error instanceof Error ? error.message : "unknown" });
  });
  return { sent: true, count };
}

async function sendWaitingReminder(input: { storeId: string; count: number }): Promise<void> {
  if (env.NODE_ENV !== "production") return;
  const to = await getAdminNotificationRecipients();
  if (to.length === 0) return;
  const { subject, text } = waitingReminderEmail(input);
  await resend.emails.send({ from: "Papelería P de Papel <orders@papeleriapdepapel.com>", to, subject, text });
}

/** Lo que dispara el barrido de recuperación (≤ cada 2 min): las tiendas con mensajes de clientas en el último día. */
export async function remindWaitingFromSweep(now = new Date()): Promise<void> {
  if (!WAITING_REMINDER_EMAIL_ENABLED || !isReminderHours(now)) return;
  const stores = await prismadb.conversation.findMany({
    where: { lastInboundAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    distinct: ["storeId"],
    select: { storeId: true },
  });
  for (const { storeId } of stores) await maybeSendWaitingReminder(storeId, now);
}

