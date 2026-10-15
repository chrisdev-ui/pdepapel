import { ConversationMessageDirection, ConversationMessageSentBy, ConversationMessageStatus, type Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { getStoreSettings } from "@/lib/store-settings";
import { runWhatsAppBot } from "@/lib/whatsapp/bot";
import { chooseFromBurst, loadBurstContext, type BurstMessage } from "@/lib/whatsapp/burst";
import { getActiveBotKeywords } from "@/lib/whatsapp/bot-replies";
import { latestOrderRequest } from "@/lib/whatsapp/order-request-store";
import { enqueueWhatsAppWaitCheck, type WhatsAppWaitCheck } from "@/lib/whatsapp/queue";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";
import {
  FALLBACK_AFTER_MS,
  LIVE_CHAT_OWNER_MESSAGES,
  LIVE_CHAT_WINDOW_MS,
  REMINDER_AFTER_MS,
  currentWait,
  decideFallback,
  decideHolding,
  holdingDueAt,
  isNight,
  type AssistDecision,
  type AssistIntent,
  type AssistKind,
  type AssistMode,
  type Wait,
  type WaitMessage,
} from "@/lib/whatsapp/waiting";
import { loadWait } from "@/lib/whatsapp/waiting-list";
import { maybeSendWaitingReminder } from "@/lib/whatsapp/waiting-reminder";

/**
 * Mientras la clienta espera a Paula: la respuesta del bot a los 10 min
 * (solo lo que sabe contestar) y el mensaje de espera, en modo apagado,
 * sombra (se anota la decisión y no sale nada) o encendido. Las reglas están
 * en `waiting.ts`; aquí está la lectura, la cola y el envío.
 *
 * Una fila de `WhatsAppWaitDecision` por espera y por tipo: el
 * `INSERT IGNORE` sobre su llave única es a la vez el turno (dos corridas no
 * pueden decidir la misma espera) y el registro del modo sombra.
 */

const ASSIST_INTENTS = new Set<string>(["fact", "product", "order", "web"]);

/** El texto con el que el bot contestaría: lo escrito en la espera, los 6 últimos y hasta 600 caracteres. */
function turnMessages(wait: Wait): BurstMessage[] {
  const texts = wait.messages.filter((message) => message.body?.trim()).map((message) => ({ id: message.id, text: message.body!.trim(), at: message.createdAt }));
  const recent = texts.slice(-6);
  while (recent.length > 1 && recent.reduce((sum, message) => sum + message.text.length, 0) > 600) recent.shift();
  return recent;
}

async function claimDecision(row: {
  storeId: string;
  conversationId: string;
  wait: Wait;
  kind: AssistKind;
  mode: AssistMode;
  decision: AssistDecision;
  scheduledFor: Date;
  now: Date;
}): Promise<boolean> {
  const id = crypto.randomUUID();
  const affected = await prismadb.$executeRaw`
    INSERT IGNORE INTO \`WhatsAppWaitDecision\`
      (\`id\`, \`storeId\`, \`conversationId\`, \`turnMessageId\`, \`kind\`, \`mode\`, \`decision\`, \`reason\`, \`intent\`, \`night\`, \`scheduledFor\`, \`decidedAt\`)
    VALUES (${id}, ${row.storeId}, ${row.conversationId}, ${row.wait.startMessageId}, ${row.kind}, ${row.mode}, ${row.decision.decision}, ${row.decision.reason},
            ${row.decision.intent ?? null}, ${isNight(row.wait.since)}, ${row.scheduledFor}, ${row.now})`;
  return affected === 1;
}

/** Decisiones que dependen del momento y no cierran nada: se espera a la corrida que toca. */
const notFinal = (decision: AssistDecision) => decision.decision === "skip" && (decision.reason === "not_latest" || decision.reason === "too_early");

export interface WaitCheckResult {
  kind: WhatsAppWaitCheck["kind"];
  decision: AssistDecision["decision"] | "no_wait" | "claimed_elsewhere";
  reason?: string | null;
}

const THIRTY_MIN = 30 * 60 * 1000;
const dedup = (...parts: string[]) => ["wait", ...parts].join("-");
const delayUntil = (at: Date, now: number) => Math.max(1, Math.ceil((at.getTime() - now) / 1000));

/** Una sola sentencia: el primero que marca el inicio de la espera la programa; los demás mensajes de la ráfaga no. */
async function claimWaitSchedule(startMessageId: string): Promise<boolean> {
  const affected = await prismadb.$executeRaw`
    UPDATE \`ConversationMessage\`
       SET \`metadata\` = JSON_SET(COALESCE(\`metadata\`, JSON_OBJECT()), '$.waitScheduled', true)
     WHERE \`id\` = ${startMessageId}
       AND JSON_EXTRACT(COALESCE(\`metadata\`, JSON_OBJECT()), '$.waitScheduled') IS NULL`;
  return affected === 1;
}

/**
 * Programa las revisiones de una espera, una sola vez por espera: lo llama
 * cualquier mensaje de la ráfaga, pero solo el primero que marca el inicio de
 * la espera publica (y el id de deduplicación de QStash es el mismo por si
 * acaso). Solo la revisión de los 10 min: la mayoría de las esperas ya tienen
 * respuesta para entonces, y esa revisión programa el mensaje de espera y el
 * recordatorio solo si la espera sigue abierta. La respuesta a los 10 min se reprograma sola si la clienta sigue
 * escribiendo; el recordatorio por correo es uno por tienda cada 30 min, no
 * uno por espera.
 */
export async function scheduleWaitChecks(conversationId: string): Promise<{ scheduled: boolean }> {
  const conversation = await prismadb.conversation.findUnique({ where: { id: conversationId }, select: { storeId: true, phone: true, bsuid: true } });
  if (!conversation) return { scheduled: false };
  const { wait } = await loadWait(conversationId);
  if (!wait || !(await claimWaitSchedule(wait.startMessageId))) return { scheduled: false };
  const contactKey = conversation.bsuid ?? conversation.phone;
  const now = Date.now();
  const check = (kind: WhatsAppWaitCheck["kind"]): WhatsAppWaitCheck => ({ conversationId, messageId: wait.startMessageId, kind });
  await enqueueWhatsAppWaitCheck(check("fallback"), contactKey, delayUntil(new Date(wait.since.getTime() + FALLBACK_AFTER_MS), now), dedup("fallback", wait.startMessageId));
  // De noche el mensaje de espera va enseguida; de día lo programa la revisión de los 10 min si la espera sigue abierta.
  if (holdingDueAt(wait.since).getTime() <= now) await runWaitCheck(check("holding"));
  return { scheduled: true };
}

/** Corre una revisión. Idempotente: la llave única deja una sola decisión por espera y tipo. */
export async function runWaitCheck(check: WhatsAppWaitCheck, now = new Date()): Promise<WaitCheckResult> {
  const conversation = await prismadb.conversation.findUnique({
    where: { id: check.conversationId },
    select: { id: true, storeId: true, phone: true, bsuid: true, orderId: true },
  });
  if (!conversation) return { kind: check.kind, decision: "no_wait" };
  if (check.kind === "reminder") {
    await maybeSendWaitingReminder(conversation.storeId, now);
    return { kind: "reminder", decision: "skip", reason: null };
  }
  const settings = await getStoreSettings(conversation.storeId);
  const loaded = await loadWait(conversation.id);
  if (!loaded.wait) return { kind: check.kind, decision: "no_wait" };
  const wait = loaded.wait;
  const base = {
    botEnabled: settings.botEnabled,
    now,
    wait,
    outboundSinceWaitStart: false,
    assistSendsThisWait: loaded.assistSends,
    handoffNoticeThisWait: loaded.promised,
  };

  if (check.kind === "holding") {
    await maybeSendWaitingReminder(conversation.storeId, now);
    const mode = settings.botHoldingMode;
    const text = isNight(now) ? settings.botHoldingNightText : settings.botHoldingText;
    const decision = decideHolding({ ...base, mode, text });
    if (notFinal(decision)) return { kind: "holding", decision: decision.decision, reason: decision.reason };
    if (!(await claimDecision({ storeId: conversation.storeId, conversationId: conversation.id, wait, kind: "holding", mode, decision, scheduledFor: holdingDueAt(wait.since), now }))) {
      return { kind: "holding", decision: "claimed_elsewhere" };
    }
    if (decision.decision === "send" && text) await sendHolding(conversation, wait, text.trim());
    return { kind: "holding", decision: decision.decision, reason: decision.reason };
  }

  const mode = settings.botFallbackMode;
  const keywords = await getActiveBotKeywords(conversation.storeId);
  const turn = turnMessages(wait);
  const choice = turn.length ? chooseFromBurst(turn, await loadBurstContext(conversation.id, turn[0].at, now, keywords)) : null;
  const intent = choice && ASSIST_INTENTS.has(choice.intent) ? (choice.intent as AssistIntent) : null;
  const [ownerRecent, order] = await Promise.all([
    prismadb.conversationMessage.count({
      where: { conversationId: conversation.id, sentBy: ConversationMessageSentBy.OWNER, createdAt: { gte: new Date(now.getTime() - LIVE_CHAT_WINDOW_MS) } },
    }),
    latestOrderRequest(conversation.id, now),
  ]);
  const openOrder = Boolean(order && order.record.status === "pending") || Boolean(conversation.orderId);
  const decision = decideFallback({ ...base, mode, messageId: wait.lastCustomerMessageId, intent, liveChat: ownerRecent >= LIVE_CHAT_OWNER_MESSAGES, openOrder });
  if (notFinal(decision)) {
    // Siguió escribiendo: los 10 min cuentan desde su último mensaje.
    if (decision.reason === "too_early") {
      await enqueueWhatsAppWaitCheck(
        { conversationId: conversation.id, messageId: wait.startMessageId, kind: "fallback" },
        conversation.bsuid ?? conversation.phone,
        delayUntil(new Date(wait.lastCustomerAt.getTime() + FALLBACK_AFTER_MS), now.getTime()),
        dedup("fallback", wait.startMessageId, wait.lastCustomerMessageId),
      );
    }
    return { kind: "fallback", decision: decision.decision, reason: decision.reason };
  }
  if (!(await claimDecision({ storeId: conversation.storeId, conversationId: conversation.id, wait, kind: "fallback", mode, decision, scheduledFor: new Date(wait.lastCustomerAt.getTime() + FALLBACK_AFTER_MS), now }))) {
    return { kind: "fallback", decision: "claimed_elsewhere" };
  }
  if (decision.decision !== "send") await scheduleFollowUps(conversation, wait, now, settings.waitingReminderEmail);
  if (decision.decision === "send" && choice) {
    const recipient = conversation.phone ?? conversation.bsuid;
    const latest = await prismadb.conversationMessage.findUnique({ where: { id: wait.lastCustomerMessageId }, select: { externalId: true, createdAt: true } });
    if (recipient && latest) {
      const result = await runWhatsAppBot({
        conversationId: conversation.id,
        recipient,
        body: choice.text,
        webOrigin: choice.webOrigin,
        inboundMessageId: latest.externalId,
        inboundAt: latest.createdAt,
        customerPhone: conversation.phone,
        customerBsuid: conversation.bsuid,
        assist: { waitStartedAt: wait.since },
      });
      await prismadb.whatsAppWaitDecision.update({
        where: { turnMessageId_kind: { turnMessageId: wait.startMessageId, kind: "fallback" } },
        data: { outcome: result.outcome },
      });
    }
  }
  return { kind: "fallback", decision: decision.decision, reason: decision.reason };
}

/** La espera sigue abierta a los 10 min: mensaje de espera a los 15 (de día) y, si el correo está encendido, el recordatorio de la tienda en su tramo de 30 min. */
async function scheduleFollowUps(conversation: { id: string; storeId: string; phone: string | null; bsuid: string | null }, wait: Wait, now: Date, reminderEmail: boolean) {
  const contactKey = conversation.bsuid ?? conversation.phone;
  const check = (kind: WhatsAppWaitCheck["kind"]): WhatsAppWaitCheck => ({ conversationId: conversation.id, messageId: wait.startMessageId, kind });
  const holdingAt = holdingDueAt(wait.since);
  if (holdingAt.getTime() > wait.since.getTime()) {
    await enqueueWhatsAppWaitCheck(check("holding"), contactKey, delayUntil(holdingAt, now.getTime()), dedup("holding", wait.startMessageId));
  }
  if (!reminderEmail) return;
  const reminderAt = new Date(Math.ceil((wait.since.getTime() + REMINDER_AFTER_MS) / THIRTY_MIN) * THIRTY_MIN);
  await enqueueWhatsAppWaitCheck(check("reminder"), contactKey, delayUntil(reminderAt, now.getTime()), dedup("reminder", conversation.storeId, String(reminderAt.getTime())));
}

/** El mensaje de espera: texto de Paula, sin botones, marcado para que no cierre la espera. */
async function sendHolding(conversation: { id: string; phone: string | null; bsuid: string | null }, wait: Wait, text: string) {
  const recipient = conversation.phone ?? conversation.bsuid;
  if (!recipient) return;
  // Justo antes de enviar: si Paula o la clienta escribieron, se calla.
  const fresh = await loadWait(conversation.id);
  if (!fresh.wait || fresh.wait.startMessageId !== wait.startMessageId || fresh.assistSends > 0) return;
  const sent = await sendWhatsAppTextMessage(recipient, text);
  await prismadb.conversationMessage.create({
    data: {
      conversationId: conversation.id,
      direction: ConversationMessageDirection.OUTBOUND,
      sentBy: ConversationMessageSentBy.BOT,
      body: text,
      externalId: sent.ok ? sent.externalId : null,
      metadata: { holding: true },
      status: sent.ok ? ConversationMessageStatus.SENT : ConversationMessageStatus.FAILED,
    },
  });
  await prismadb.whatsAppWaitDecision.update({
    where: { turnMessageId_kind: { turnMessageId: wait.startMessageId, kind: "holding" } },
    data: { outcome: sent.ok ? "sent" : "send_failed" },
  });
}
