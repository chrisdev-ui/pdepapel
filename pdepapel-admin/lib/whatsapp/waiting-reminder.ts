import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { claimWindow } from "@/lib/whatsapp/recovery";
import { countWaitingConversations } from "@/lib/whatsapp/waiting-list";
import { REMINDER_AFTER_MS, REMINDER_MAX_WAIT_MS, isReminderHours, waitingReminderEmail } from "@/lib/whatsapp/waiting";

export const WAITING_REMINDER_EVERY_MS = 60 * 60 * 1000;
export const WAITING_CHECK_EVERY_MS = 10 * 60 * 1000;
/** Fila fija de `JobRun` por tienda: como mucho un correo por hora. */
export const waitingReminderRow = (storeId: string) => `whatsapp-waiting:alert:${storeId}`;

export interface WaitingReminderDeps {
  send?: (input: { storeId: string; count: number }) => Promise<void>;
  enabled?: boolean;
}

/** «Avisarme por correo cuando un cliente espere» (Ajustes); sin fila, apagado. */
export async function isWaitingReminderEnabled(storeId: string): Promise<boolean> {
  const settings = await prismadb.storeSettings.findUnique({ where: { storeId }, select: { waitingReminderEmail: true } });
  return settings?.waitingReminderEmail ?? false;
}

/**
 * Correo a Paula cuando una clienta lleva más de 30 min (y menos de un día)
 * esperándola, de 08:00 a 22:59 en Bogotá y como mucho uno por hora, solo si
 * lo encendió en Ajustes (apagado por defecto). Solo la cuenta y el enlace a
 * la lista filtrada: ni nombres, ni teléfonos, ni texto de mensajes.
 */
export async function maybeSendWaitingReminder(storeId: string, now = new Date(), deps: WaitingReminderDeps = {}): Promise<{ sent: boolean; count: number }> {
  if (!isReminderHours(now)) return { sent: false, count: 0 };
  if (!(deps.enabled ?? (await isWaitingReminderEnabled(storeId)))) return { sent: false, count: 0 };
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

/** Lo que dispara el barrido de recuperación (≤ cada 2 min): las tiendas con el correo encendido y mensajes de clientas en el último día. */
export async function remindWaitingFromSweep(now = new Date()): Promise<void> {
  if (!isReminderHours(now)) return;
  const enabled = await prismadb.storeSettings.findMany({ where: { waitingReminderEmail: true }, select: { storeId: true } });
  if (enabled.length === 0) return;
  const stores = await prismadb.conversation.findMany({
    where: { storeId: { in: enabled.map((row) => row.storeId) }, lastInboundAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    distinct: ["storeId"],
    select: { storeId: true },
  });
  for (const { storeId } of stores) await maybeSendWaitingReminder(storeId, now);
}

