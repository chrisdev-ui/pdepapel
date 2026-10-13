import { MarketplaceProvider, MarketplaceWebhookEventStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { WHATSAPP_BACKLOG_NOTE, extractWhatsAppEvents, processWhatsAppWebhookEvent } from "@/lib/whatsapp/conversation-sync";
import { IGNORED_EVENT_NOTE, findIgnoredContact } from "@/lib/whatsapp/ignored-contacts";
import { RECOVERY_MAX_AGE_MS } from "@/lib/whatsapp/recovery";
import { getWhatsAppWebhookIdentity } from "@/lib/whatsapp/webhook";
import { resolveFallbackStoreId } from "@/lib/whatsapp/webhook-intake";

/**
 * El atraso que la recuperación automática no toca (más de 72 h): se archiva
 * como historial viejo con el procesador en modo atraso (sin bot, sin sombra,
 * sin reabrir ni pasar a Paula, sin mover fechas hacia atrás, mensajes
 * marcados «Recuperado»). Contacto ignorado → PROCESSED sin archivar nada;
 * evento vacío → FAILED con nota. Devuelve solo conteos.
 */
export const BACKLOG_EMPTY_NOTE = "Evento sin mensajes, ecos ni estados: no hay nada que recuperar.";

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
  }
  if (!options.apply) return { mode: "dry-run" as const, plan };

  const settable = { in: [MarketplaceWebhookEventStatus.PENDING, MarketplaceWebhookEventStatus.FAILED] };
  const conversationsBefore = await prismadb.conversation.count();
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
  const [conversationsAfter, botMessagesSent] = await Promise.all([
    prismadb.conversation.count(),
    prismadb.conversationMessage.count({ where: { sentBy: "BOT", createdAt: { gte: startedAt } } }),
  ]);
  return { mode: "apply" as const, plan, done, newConversations: conversationsAfter - conversationsBefore, botMessagesSent };
}
