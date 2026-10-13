import { ConversationChannel, ConversationStatus, MarketplaceProvider, MarketplaceWebhookEventStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { WHATSAPP_BACKLOG_NOTE, extractWhatsAppEvents, processWhatsAppWebhookEvent } from "@/lib/whatsapp/conversation-sync";
import { IGNORED_EVENT_NOTE, findIgnoredContact } from "@/lib/whatsapp/ignored-contacts";
import { RECOVERY_MAX_AGE_MS } from "@/lib/whatsapp/recovery";
import { getWhatsAppWebhookIdentity } from "@/lib/whatsapp/webhook";
import { resolveFallbackStoreId } from "@/lib/whatsapp/webhook-intake";

/**
 * El atraso que la recuperación automática no toca (más de 72 h): se archiva
 * como historial viejo con el procesador en modo atraso (sin bot, sin sombra,
 * sin reabrir ni pasar a Paula, sin mover fechas hacia atrás, mensajes de la
 * clienta marcados «Recuperado»). Contacto ignorado → PROCESSED sin archivar
 * nada; evento vacío → FAILED con nota. Devuelve solo conteos: el ensayo lo
 * que haría, la corrida lo que midió antes y después.
 */
export const BACKLOG_EMPTY_NOTE = "Evento sin mensajes, ecos ni estados: no hay nada que recuperar.";

type Contact = { storeId: string; phone: string | null; bsuid: string | null; hasCustomerMessage: boolean };

const contactKey = (contact: { storeId: string; phone: string | null; bsuid: string | null }) =>
  `${contact.storeId}:${contact.bsuid ?? ""}:${contact.phone ?? ""}`;

async function conversationFor(contact: { storeId: string; phone: string | null; bsuid: string | null }) {
  const or = [...(contact.bsuid ? [{ bsuid: contact.bsuid }] : []), ...(contact.phone ? [{ phone: contact.phone }] : [])];
  if (!or.length) return null;
  return prismadb.conversation.findFirst({
    where: { storeId: contact.storeId, channel: ConversationChannel.WHATSAPP, OR: or },
    select: { id: true, status: true, lastInboundAt: true, lastOutboundAt: true },
  });
}

export async function recoverWhatsAppBacklog(options: { apply: boolean; now?: Date }) {
  const startedAt = options.now ?? new Date();
  const events = await prismadb.marketplaceWebhookEvent.findMany({
    where: {
      provider: MarketplaceProvider.WHATSAPP,
      createdAt: { lt: new Date(startedAt.getTime() - RECOVERY_MAX_AGE_MS) },
      OR: [{ status: MarketplaceWebhookEventStatus.PENDING }, { status: MarketplaceWebhookEventStatus.FAILED, lastError: WHATSAPP_BACKLOG_NOTE }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, payload: true, connection: { select: { storeId: true } } },
  });

  const plan = { events: events.length, ignored: 0, empty: 0, statusesOnly: 0, withMessagesOrEchoes: 0, customerMessages: 0, ownerEchoes: 0 };
  const routes: { id: string; route: "ignored" | "empty" | "process" }[] = [];
  const contacts = new Map<string, Contact>();
  for (const event of events) {
    const extracted = extractWhatsAppEvents(event.payload as never);
    const identity = getWhatsAppWebhookIdentity(event.payload as never);
    const storeId = event.connection?.storeId ?? (await resolveFallbackStoreId(identity));
    if (storeId && (await findIgnoredContact(storeId, identity))) {
      plan.ignored += 1;
      routes.push({ id: event.id, route: "ignored" });
      continue;
    }
    if (!extracted.messages.length && !extracted.ownerEchoes.length && !extracted.statuses.length) {
      plan.empty += 1;
      routes.push({ id: event.id, route: "empty" });
      continue;
    }
    if (extracted.messages.length || extracted.ownerEchoes.length) plan.withMessagesOrEchoes += 1;
    else plan.statusesOnly += 1;
    plan.customerMessages += extracted.messages.length;
    plan.ownerEchoes += extracted.ownerEchoes.length;
    routes.push({ id: event.id, route: "process" });
    if (!storeId) continue;
    for (const [list, fromCustomer] of [[extracted.messages, true], [extracted.ownerEchoes, false]] as const) {
      for (const item of list) {
        const contact = { storeId, phone: item.phone, bsuid: item.bsuid };
        const known = contacts.get(contactKey(contact));
        contacts.set(contactKey(contact), { ...contact, hasCustomerMessage: Boolean(known?.hasCustomerMessage) || fromCustomer });
      }
    }
  }

  // Lo que ya existe, antes de tocar nada: así el ensayo dice qué crearía y la corrida mide qué cambió.
  const before = new Map<string, Awaited<ReturnType<typeof conversationFor>>>();
  for (const [key, contact] of Array.from(contacts.entries())) before.set(key, await conversationFor(contact));
  const missing = Array.from(contacts.entries()).filter(([key]) => !before.get(key));
  const expected = {
    conversationsCreated: missing.length,
    neverSeenContactsShownAsRecuperado: missing.filter(([, contact]) => contact.hasCustomerMessage).length,
    newConversationsWithOnlyPaulaEchoes: missing.filter(([, contact]) => !contact.hasCustomerMessage).length,
    existingConversationsTouched: contacts.size - missing.length,
    conversationsMovedToWaiting: 0,
    lastInboundAtMovedBackwards: 0,
    botRunsOrSends: 0,
    finalStatus: { PROCESSED: plan.ignored + plan.statusesOnly + plan.withMessagesOrEchoes, FAILED: plan.empty },
  };
  if (!options.apply) return { mode: "dry-run" as const, plan, expected };

  const settable = { in: [MarketplaceWebhookEventStatus.PENDING, MarketplaceWebhookEventStatus.FAILED] };
  const done = { ignored: 0, empty: 0, processed: 0, notProcessed: 0 };
  for (const { id, route } of routes) {
    if (route === "ignored") {
      const updated = await prismadb.marketplaceWebhookEvent.updateMany({
        where: { id, status: settable },
        data: { status: MarketplaceWebhookEventStatus.PROCESSED, processedAt: new Date(), nextRetryAt: null, lastError: IGNORED_EVENT_NOTE },
      });
      done.ignored += updated.count;
    } else if (route === "empty") {
      const updated = await prismadb.marketplaceWebhookEvent.updateMany({
        where: { id, status: settable },
        data: { status: MarketplaceWebhookEventStatus.FAILED, nextRetryAt: null, lastError: BACKLOG_EMPTY_NOTE },
      });
      done.empty += updated.count;
    } else {
      const result = await processWhatsAppWebhookEvent(id, { backlog: true });
      if (result.processed) done.processed += 1;
      else done.notProcessed += 1;
    }
  }

  let conversationsCreated = 0;
  let neverSeenContactsShownAsRecuperado = 0;
  let conversationsMovedToWaiting = 0;
  let lastInboundAtMovedBackwards = 0;
  let lastOutboundAtMovedBackwards = 0;
  for (const [key, contact] of Array.from(contacts.entries())) {
    const was = before.get(key);
    const now = await conversationFor(contact);
    if (!now) continue;
    if (!was) {
      conversationsCreated += 1;
      const recovered = await prismadb.conversationMessage.count({ where: { conversationId: now.id, metadata: { path: "$.recovered", string_contains: "-" } } });
      if (recovered > 0) neverSeenContactsShownAsRecuperado += 1;
      if (now.status === ConversationStatus.NEEDS_OWNER) conversationsMovedToWaiting += 1;
      continue;
    }
    if (now.status === ConversationStatus.NEEDS_OWNER && was.status !== ConversationStatus.NEEDS_OWNER) conversationsMovedToWaiting += 1;
    if (was.lastInboundAt && (!now.lastInboundAt || now.lastInboundAt < was.lastInboundAt)) lastInboundAtMovedBackwards += 1;
    if (was.lastOutboundAt && (!now.lastOutboundAt || now.lastOutboundAt < was.lastOutboundAt)) lastOutboundAtMovedBackwards += 1;
  }
  const [botMessages, shadowRows, finalStatuses] = await Promise.all([
    prismadb.conversationMessage.count({ where: { sentBy: "BOT", createdAt: { gte: startedAt } } }),
    prismadb.whatsAppBotShadowRun.count({ where: { createdAt: { gte: startedAt } } }),
    prismadb.marketplaceWebhookEvent.groupBy({ by: ["status"], where: { id: { in: events.map((event) => event.id) } }, _count: true }),
  ]);
  return {
    mode: "apply" as const,
    plan,
    expected,
    measured: {
      done,
      conversationsCreated,
      neverSeenContactsShownAsRecuperado,
      conversationsMovedToWaiting,
      lastInboundAtMovedBackwards,
      lastOutboundAtMovedBackwards,
      botRunsOrSends: botMessages + shadowRows,
      finalStatus: Object.fromEntries(finalStatuses.map((row) => [row.status, row._count])),
    },
  };
}
