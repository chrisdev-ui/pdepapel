import prismadb from "@/lib/prismadb";
import { getWebPushConfig, sendWebPushToStore, type WebPushConfig, type WebPushResult } from "@/lib/web-push";
import { ALERT_MAX_WAIT_MS, clampAlertMinutes, decideAlert, isNight, waitingAlertPush, type Wait } from "@/lib/whatsapp/waiting";
import { findWaitingConversations, loadWait } from "@/lib/whatsapp/waiting-list";

/**
 * «Clientas esperando»: la tarjeta de Inicio, el número de «Conversaciones»
 * en el menú y el aviso push a la dueña, los tres con el mismo umbral
 * (`StoreSettings.waitingAlertMinutes`) y la misma cuenta. Incluye las
 * conversaciones en la pausa de 24 h de Paula: la espera no mira el estado.
 * Sin nombres, teléfonos ni texto de mensajes.
 */
export async function getWaitingAlertMinutes(storeId: string): Promise<number> {
  const settings = await prismadb.storeSettings.findUnique({ where: { storeId }, select: { waitingAlertMinutes: true } });
  return clampAlertMinutes(settings?.waitingAlertMinutes);
}

export interface WaitingAlertItem {
  conversationId: string;
  since: Date;
}

export interface WaitingAlertSummary {
  minutes: number;
  count: number;
  /** De la que más lleva esperando a la que menos. */
  items: WaitingAlertItem[];
}

export async function loadWaitingAlertSummary(storeId: string, now = new Date()): Promise<WaitingAlertSummary> {
  const minutes = await getWaitingAlertMinutes(storeId);
  const waiting = await findWaitingConversations(storeId, now, minutes * 60 * 1000, Infinity, { onlyWithOldMessage: true });
  const items = Array.from(waiting, ([conversationId, entry]) => ({ conversationId, since: entry.since })).sort((a, b) => a.since.getTime() - b.since.getTime());
  return { minutes, count: items.length, items };
}

const SHARED_FOR_MS = 5000;
const recent = new Map<string, { at: number; summary: Promise<WaitingAlertSummary> }>();

/** El menú y la tarjeta de Inicio se pintan en la misma carga: una sola lectura para los dos. */
export function getWaitingAlertSummary(storeId: string): Promise<WaitingAlertSummary> {
  const now = Date.now();
  const hit = recent.get(storeId);
  if (hit && now - hit.at < SHARED_FOR_MS) return hit.summary;
  const summary = loadWaitingAlertSummary(storeId, new Date(now));
  recent.set(storeId, { at: now, summary });
  summary.catch(() => recent.delete(storeId));
  return summary;
}

export type AlertCheckResult =
  | { decision: "no_wait" | "claimed_elsewhere" | "no_devices" }
  | { decision: "skip"; reason: "too_early" | "quiet_hours" | "too_old"; dueAt?: Date }
  | { decision: "send"; outcome: string };

export interface AlertDeps {
  config?: WebPushConfig | null;
  push?: (storeId: string, payload: ReturnType<typeof waitingAlertPush> & { tag: string }) => Promise<WebPushResult>;
}

/** Una fila por espera (`@@unique([turnMessageId, kind])`): el `INSERT IGNORE` es el turno. */
async function claimAlert(input: { storeId: string; conversationId: string; wait: Wait; decision: "send" | "skip"; reason: string | null; scheduledFor: Date; now: Date }) {
  const affected = await prismadb.$executeRaw`
    INSERT IGNORE INTO \`WhatsAppWaitDecision\`
      (\`id\`, \`storeId\`, \`conversationId\`, \`turnMessageId\`, \`kind\`, \`mode\`, \`decision\`, \`reason\`, \`intent\`, \`night\`, \`scheduledFor\`, \`decidedAt\`)
    VALUES (${crypto.randomUUID()}, ${input.storeId}, ${input.conversationId}, ${input.wait.startMessageId}, 'alert', 'PUSH', ${input.decision}, ${input.reason},
            NULL, ${isNight(input.wait.since)}, ${input.scheduledFor}, ${input.now})`;
  return affected === 1;
}

/**
 * El aviso de una espera. Sin aparatos registrados no se anota nada (no hay a
 * quién avisar y la espera ya está en Inicio). En horas de silencio se anota
 * `quiet_hours` y esa espera ya no avisa a las 7.
 */
export async function runAlertCheck(
  conversation: { id: string; storeId: string },
  startMessageId: string | null,
  now = new Date(),
  deps: AlertDeps = {},
): Promise<AlertCheckResult> {
  const { wait } = await loadWait(conversation.id);
  if (!wait || (startMessageId && wait.startMessageId !== startMessageId)) return { decision: "no_wait" };
  const minutes = await getWaitingAlertMinutes(conversation.storeId);
  const scheduledFor = new Date(wait.since.getTime() + minutes * 60 * 1000);
  const decided = decideAlert({ wait, now, minutes });
  if (decided.decision === "skip" && decided.reason === "too_early") return { decision: "skip", reason: "too_early", dueAt: scheduledFor };
  const config = deps.config === undefined ? getWebPushConfig() : deps.config;
  if (!config || (await prismadb.webPushSubscription.count({ where: { storeId: conversation.storeId } })) === 0) return { decision: "no_devices" };
  const claimed = await claimAlert({ storeId: conversation.storeId, conversationId: conversation.id, wait, decision: decided.decision, reason: decided.reason, scheduledFor, now });
  if (!claimed) return { decision: "claimed_elsewhere" };
  if (decided.decision === "skip") return { decision: "skip", reason: decided.reason };
  const payload = { ...waitingAlertPush({ storeId: conversation.storeId, since: wait.since, now }), tag: `clientas-esperando-${conversation.storeId}` };
  const result = await (deps.push ?? ((storeId, body) => sendWebPushToStore(storeId, body, { config, now })))(conversation.storeId, payload);
  const outcome = result.delivered > 0 ? "sent" : result.devices === 0 ? "no_devices" : "send_failed";
  await prismadb.whatsAppWaitDecision.updateMany({ where: { turnMessageId: wait.startMessageId, kind: "alert" }, data: { outcome } });
  return { decision: "send", outcome };
}

/** Como mucho una pasada por tienda cada 5 min: leer las esperas cuesta unas cuantas consultas. */
const SWEEP_EVERY_MS = 5 * 60 * 1000;

/**
 * Red de seguridad del barrido de recuperación (≤ cada 2 min, cuando llegan
 * webhooks): las esperas que ya pasaron el umbral y no tienen aviso, por si
 * QStash no aceptó la revisión o la dueña bajó el umbral después. Solo las
 * tiendas con algún aparato registrado.
 */
export async function alertWaitingFromSweep(now = new Date(), deps: AlertDeps = {}): Promise<number> {
  const config = deps.config === undefined ? getWebPushConfig() : deps.config;
  if (!config) return 0;
  const stores = await prismadb.webPushSubscription.findMany({ distinct: ["storeId"], select: { storeId: true } });
  // Import diferido: recovery arrastra el procesador de mensajes, que el menú del panel no necesita.
  const { claimWindow } = await import("@/lib/whatsapp/recovery");
  let decided = 0;
  for (const { storeId } of stores) {
    if (!(await claimWindow(`whatsapp-waiting:push-sweep:${storeId}`, SWEEP_EVERY_MS, now))) continue;
    const minutes = await getWaitingAlertMinutes(storeId);
    const waiting = await findWaitingConversations(storeId, now, minutes * 60 * 1000, ALERT_MAX_WAIT_MS, { onlyWithOldMessage: true });
    for (const conversationId of Array.from(waiting.keys())) {
      const result = await runAlertCheck({ id: conversationId, storeId }, null, now, { ...deps, config });
      if (result.decision === "send" || result.decision === "skip") decided += 1;
    }
  }
  return decided;
}
