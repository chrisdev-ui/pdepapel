import { MarketplaceProvider, MarketplaceWebhookEventStatus, type Prisma } from "@prisma/client";

import { env } from "@/lib/env.mjs";
import { recordJobRun } from "@/lib/job-runs";
import prismadb from "@/lib/prismadb";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { MAX_WHATSAPP_EVENT_ATTEMPTS, WHATSAPP_BACKLOG_NOTE } from "@/lib/whatsapp/conversation-sync";
import { IGNORED_EVENT_NOTE, findIgnoredContact } from "@/lib/whatsapp/ignored-contacts";
import { enqueueWhatsAppWebhookEvent } from "@/lib/whatsapp/queue";
import { getWhatsAppWebhookConversationKey, getWhatsAppWebhookIdentity } from "@/lib/whatsapp/webhook";
import { resolveFallbackStoreId } from "@/lib/whatsapp/webhook-intake";

/**
 * Recuperación de eventos de WhatsApp que se quedaron sin procesar: PENDING
 * porque QStash no los aceptó (el 21-sep la cuota diaria se agotó y 54
 * mensajes de clientas nunca se archivaron) o RETRY porque el procesador
 * falló y respondió 200. Se vuelven a encolar por la MISMA fila de la clienta;
 * esto nunca llama al bot (el procesador decide, y no contesta lo viejo).
 *
 * No usa un horario de QStash: competiría por la misma cuota. Corre de paso
 * con cada webhook (como mucho cada 2 min) y una vez al día desde GitHub.
 */
export const RECOVERY_MIN_AGE_MS = 2 * 60 * 1000;
export const RECOVERY_MAX_AGE_MS = 72 * 60 * 60 * 1000;
export const RECOVERY_BATCH = 50;
export const RECOVERY_THROTTLE_MS = 2 * 60 * 1000;
export const STUCK_ALERT_AFTER_MS = 10 * 60 * 1000;
export const STUCK_ALERT_EVERY_MS = 60 * 60 * 1000;
const BACKOFF_MAX_MS = 60 * 60 * 1000;

/** Filas fijas de `JobRun` (fuera de JOB_DEFINITIONS): el id es la guarda única. */
export const RECOVERY_THROTTLE_ROW = "whatsapp-recovery:throttle";
export const STUCK_ALERT_ROW = "whatsapp-recovery:alert";

/** 2, 4, 8… hasta 60 min, según la edad: un PENDING no lleva cuenta de reencolados. */
export function recoveryBackoffMs(ageMs: number): number {
  const steps = Math.max(0, Math.floor(Math.log2(Math.max(ageMs, RECOVERY_MIN_AGE_MS) / RECOVERY_MIN_AGE_MS)));
  return Math.min(BACKOFF_MAX_MS, RECOVERY_MIN_AGE_MS * 2 ** steps);
}

/** Toma la ventana `windowMs` de una fila fija en una sola sentencia; crea la fila si falta. */
export async function claimWindow(rowId: string, windowMs: number, now = new Date()): Promise<boolean> {
  await prismadb.$executeRaw`
    INSERT IGNORE INTO \`JobRun\` (\`id\`, \`storeId\`, \`name\`, \`ranAt\`, \`ok\`, \`detail\`)
    VALUES (${rowId}, NULL, ${rowId}, ${new Date(0)}, true, NULL)`;
  const affected = await prismadb.$executeRaw`
    UPDATE \`JobRun\`
       SET \`ranAt\` = ${now}
     WHERE \`id\` = ${rowId}
       AND \`ranAt\` < ${new Date(now.getTime() - windowMs)}`;
  return affected === 1;
}

/** Reclama un evento para reencolarlo; `nextRetryAt` no se toca o el procesador lo daría por «no toca aún». */
async function claimEvent(id: string, now: Date, backoffMs: number): Promise<boolean> {
  const affected = await prismadb.$executeRaw`
    UPDATE \`MarketplaceWebhookEvent\`
       SET \`updatedAt\` = ${now}
     WHERE \`id\` = ${id}
       AND \`status\` IN ('PENDING', 'RETRY')
       AND \`updatedAt\` < ${new Date(now.getTime() - backoffMs)}`;
  return affected === 1;
}

export interface StuckCounts {
  pending: number;
  retryOverdue: number;
}

export interface RecoveryDeps {
  enqueue?: typeof enqueueWhatsAppWebhookEvent;
  sendAlert?: (counts: StuckCounts) => Promise<void>;
}

export interface RecoveryResult {
  throttled: boolean;
  tooOld: number;
  ignored: number;
  requeued: number;
  publishFailed: boolean;
  stuck: StuckCounts;
  alerted: boolean;
}

const dueWhere = (now: Date): Prisma.MarketplaceWebhookEventWhereInput => ({
  provider: MarketplaceProvider.WHATSAPP,
  attempts: { lt: MAX_WHATSAPP_EVENT_ATTEMPTS },
  createdAt: { gte: new Date(now.getTime() - RECOVERY_MAX_AGE_MS) },
  OR: [
    { status: MarketplaceWebhookEventStatus.PENDING, createdAt: { lt: new Date(now.getTime() - RECOVERY_MIN_AGE_MS) } },
    { status: MarketplaceWebhookEventStatus.RETRY, OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
  ],
});

export async function countStuckWhatsAppEvents(now = new Date()): Promise<StuckCounts> {
  const since = new Date(now.getTime() - RECOVERY_MAX_AGE_MS);
  const before = new Date(now.getTime() - STUCK_ALERT_AFTER_MS);
  const [pending, retryOverdue] = await Promise.all([
    prismadb.marketplaceWebhookEvent.count({
      where: { provider: MarketplaceProvider.WHATSAPP, status: MarketplaceWebhookEventStatus.PENDING, createdAt: { gte: since, lt: before } },
    }),
    prismadb.marketplaceWebhookEvent.count({
      where: { provider: MarketplaceProvider.WHATSAPP, status: MarketplaceWebhookEventStatus.RETRY, createdAt: { gte: since }, nextRetryAt: { lt: before } },
    }),
  ]);
  return { pending, retryOverdue };
}

export async function sweepWhatsAppEvents(
  options: { now?: Date; force?: boolean } = {},
  deps: RecoveryDeps = {},
): Promise<RecoveryResult> {
  const now = options.now ?? new Date();
  const result: RecoveryResult = { throttled: false, tooOld: 0, ignored: 0, requeued: 0, publishFailed: false, stuck: { pending: 0, retryOverdue: 0 }, alerted: false };
  if (!options.force && !(await claimWindow(RECOVERY_THROTTLE_ROW, RECOVERY_THROTTLE_MS, now))) {
    return { ...result, throttled: true };
  }

  const tooOld = await prismadb.marketplaceWebhookEvent.updateMany({
    where: {
      provider: MarketplaceProvider.WHATSAPP,
      status: { in: [MarketplaceWebhookEventStatus.PENDING, MarketplaceWebhookEventStatus.RETRY] },
      createdAt: { lt: new Date(now.getTime() - RECOVERY_MAX_AGE_MS) },
    },
    data: { status: MarketplaceWebhookEventStatus.FAILED, nextRetryAt: null, lastError: WHATSAPP_BACKLOG_NOTE },
  });
  result.tooOld = tooOld.count;

  const due = await prismadb.marketplaceWebhookEvent.findMany({
    where: dueWhere(now),
    orderBy: { createdAt: "asc" },
    take: RECOVERY_BATCH,
    select: { id: true, createdAt: true, payload: true, connection: { select: { storeId: true } } },
  });
  const enqueue = deps.enqueue ?? enqueueWhatsAppWebhookEvent;
  for (const event of due) {
    const payload = event.payload as Parameters<typeof getWhatsAppWebhookIdentity>[0];
    const identity = getWhatsAppWebhookIdentity(payload);
    const storeId = event.connection?.storeId ?? (await resolveFallbackStoreId(identity));
    if (storeId && (await findIgnoredContact(storeId, identity))) {
      await prismadb.marketplaceWebhookEvent.updateMany({
        where: { id: event.id, status: { in: [MarketplaceWebhookEventStatus.PENDING, MarketplaceWebhookEventStatus.RETRY] } },
        data: { status: MarketplaceWebhookEventStatus.PROCESSED, processedAt: now, nextRetryAt: null, lastError: IGNORED_EVENT_NOTE },
      });
      result.ignored += 1;
      continue;
    }
    if (!(await claimEvent(event.id, now, recoveryBackoffMs(now.getTime() - event.createdAt.getTime())))) continue;
    // Si QStash no acepta uno (cuota agotada), tampoco aceptará los demás ahora.
    let queued = false;
    try {
      queued = await enqueue(event.id, getWhatsAppWebhookConversationKey(payload));
    } catch {
      queued = false;
    }
    if (!queued) {
      result.publishFailed = true;
      break;
    }
    result.requeued += 1;
  }

  result.stuck = await countStuckWhatsAppEvents(now);
  if (result.stuck.pending + result.stuck.retryOverdue > 0 && (await claimWindow(STUCK_ALERT_ROW, STUCK_ALERT_EVERY_MS, now))) {
    await (deps.sendAlert ?? sendStuckEventsAlert)(result.stuck).catch((error: unknown) => {
      console.error("[WHATSAPP_RECOVERY] No se pudo enviar el aviso", { message: error instanceof Error ? error.message : "unknown" });
    });
    result.alerted = true;
  }

  // De paso, el recordatorio de «Esperando a Paula» (como mucho uno por hora).
  await import("@/lib/whatsapp/waiting-reminder")
    .then(({ remindWaitingFromSweep }) => remindWaitingFromSweep(now))
    .catch((error: unknown) => {
      console.warn("[WHATSAPP_RECOVERY] No se pudo revisar «Esperando a Paula»", { message: error instanceof Error ? error.message : "unknown" });
    });

  await recordJobRun("whatsapp-recovery", {
    ok: !result.publishFailed && result.stuck.pending + result.stuck.retryOverdue === 0,
    detail: `Reencolados ${result.requeued}; ignorados ${result.ignored}; viejos ${result.tooOld}; atascados ${result.stuck.pending} pendientes y ${result.stuck.retryOverdue} reintentos vencidos${result.publishFailed ? "; QStash no aceptó un evento" : ""}.`,
  });
  return result;
}

/** Solo conteos: ni teléfonos ni texto. Como mucho uno por hora (la fila de aviso). */
export async function sendStuckEventsAlert(counts: StuckCounts): Promise<void> {
  if (env.NODE_ENV !== "production") return;
  const to = await getAdminNotificationRecipients();
  if (to.length === 0) {
    console.warn("[WHATSAPP_RECOVERY] Sin correos para avisos; no se avisa.");
    return;
  }
  await resend.emails.send({
    from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
    to,
    subject: "[Alerta] Mensajes de WhatsApp sin procesar",
    text:
      `Hay eventos de WhatsApp sin procesar desde hace más de 10 minutos: ${counts.pending} pendientes y ${counts.retryOverdue} reintentos vencidos.\n\n` +
      "La recuperación los vuelve a encolar sola; si el aviso se repite, revisa la cuota de QStash y los registros de Vercel.\n\n" +
      "Este aviso sale como mucho una vez por hora.",
  });
}

/**
 * Lo que dispara el webhook: nunca lanza ni demora la respuesta, y se corta
 * solo a los 20 s para no ocupar la función.
 */
export async function sweepWhatsAppEventsQuietly(deps: RecoveryDeps = {}): Promise<void> {
  try {
    await Promise.race([
      sweepWhatsAppEvents({}, deps),
      new Promise((resolve) => setTimeout(resolve, 20_000)),
    ]);
  } catch (error) {
    console.error("[WHATSAPP_RECOVERY] Falló la recuperación de paso", { message: error instanceof Error ? error.message : "unknown" });
  }
}
