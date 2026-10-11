import { ConversationMessageDirection, ConversationMessageSentBy, ConversationMessageStatus, Prisma } from "@prisma/client";

import { describeBotPause } from "@/lib/conversation-bot-pause";
import prismadb from "@/lib/prismadb";
import { getStoreSettings } from "@/lib/store-settings";
import { BUSINESS_FACT_TEMPLATES, areBusinessFactsApproved, classifyBusinessFact, isWelcomeGreeting } from "@/lib/whatsapp/bot-facts";
import { BOT_MESSAGE_WINDOW_MS, WELCOME_REPEAT_WINDOW_MS, findPendingCustomerActivity, isBotEnabled } from "@/lib/whatsapp/bot-guards";
import { formatBotReply, matchWhatsAppKeyword } from "@/lib/whatsapp/bot-matching";
import { areProductAnswersApproved, fallbackQueryFromMessage, looksLikeProductQuestion } from "@/lib/whatsapp/bot-products";
import { isOfferFresh, isShippingCostQuestion, offeredProductId, parseAppendRequest, parseOrderReply } from "@/lib/whatsapp/bot-order-request";
import { getActiveBotKeywords } from "@/lib/whatsapp/bot-replies";
import { BOT_INTENT_HISTORY, classifyMessageIntent, isEmojiOnly, type BotIntentResult } from "@/lib/whatsapp/shadow/intent";
import {
  planShadowReply,
  shadowGuard,
  shadowWantsSearch,
  type ShadowContext,
  type ShadowMessageType,
  type ShadowSignals,
} from "@/lib/whatsapp/shadow/plan";
import { isShadowCandidate, type ShadowCandidate, type ShadowDeps } from "@/lib/whatsapp/shadow/candidate";
import { countInStockMatches } from "@/lib/whatsapp/shadow/search";
import { latestOrderRequest } from "@/lib/whatsapp/order-request-store";

type RealType = ShadowMessageType | "wait_notice" | "text";

const OUTCOME_TYPE: Record<string, RealType> = {
  replied: "keyword",
  replied_business_fact: "fact",
  replied_product: "product_list",
  replied_product_reference: "product_list",
  replied_product_unsure: "handoff",
  replied_shipping_quote: "shipping_quote",
  replied_web_origin: "web_welcome",
};

/**
 * Lo que mandó el bot real a este mensaje: sus salientes entre el mensaje y
 * el momento en que terminó. La bienvenida y las respuestas de producto se
 * reconocen por su metadata; el resto, por el resultado del bot.
 */
export function realTypesFrom(
  rows: { body: string | null; metadata: Prisma.JsonValue }[],
  outcome: string,
): RealType[] {
  const hasProduct = rows.some((row) => {
    const meta = row.metadata as { shown?: unknown; decision?: unknown } | null;
    return Boolean(meta?.shown || meta?.decision);
  });
  return rows.map((row) => {
    const meta = row.metadata as { kind?: string; shown?: unknown; decision?: { outcome?: string } } | null;
    if (meta?.kind === "welcome") return "welcome";
    if ((row.metadata as { orderRequest?: unknown } | null)?.orderRequest) return outcome === "replied_order_appended" ? "order_append" : "order_request";
    if (meta?.decision?.outcome === "unsure") return "handoff";
    if (meta?.shown || meta?.decision) return "product_list";
    if (hasProduct) return "wait_notice";
    if (outcome.startsWith("escalated")) return "handoff";
    return OUTCOME_TYPE[outcome] ?? "text";
  });
}

async function loadContext(
  candidate: ShadowCandidate,
  inbound: { id: string; createdAt: Date },
  conversation: { storeId: string; lastOwnerAt: Date | null },
  realOutcome: string,
  deps: ShadowDeps,
): Promise<{ ctx: ShadowContext; previousTexts: string[] }> {
  const { storeId } = conversation;
  const now = new Date();
  const conversationId = candidate.conversationId;
  const before = { lt: inbound.createdAt };
  const [enabled, settings, newer, pending, earlierCount, lastBot, recentBot, previous, shadowRows, keywords] = await Promise.all([
    isBotEnabled(storeId),
    getStoreSettings(storeId).catch(() => null),
    prismadb.conversationMessage.findFirst({
      where: {
        conversationId,
        direction: ConversationMessageDirection.INBOUND,
        sentBy: ConversationMessageSentBy.CUSTOMER,
        createdAt: { gt: inbound.createdAt },
      },
      select: { id: true },
    }),
    findPendingCustomerActivity({
      eventId: candidate.eventId,
      eventCreatedAt: candidate.eventCreatedAt,
      phone: candidate.customerPhone,
      bsuid: candidate.customerBsuid,
    }),
    prismadb.conversationMessage.count({ where: { conversationId, createdAt: before } }),
    prismadb.conversationMessage.findFirst({
      where: { conversationId, sentBy: ConversationMessageSentBy.BOT, createdAt: before },
      orderBy: { createdAt: "desc" },
      select: { id: true, body: true, metadata: true, createdAt: true },
    }),
    prismadb.conversationMessage.findMany({
      where: {
        conversationId,
        sentBy: ConversationMessageSentBy.BOT,
        createdAt: { gte: new Date(inbound.createdAt.getTime() - WELCOME_REPEAT_WINDOW_MS), lt: inbound.createdAt },
      },
      select: { body: true, metadata: true },
      take: 50,
    }),
    prismadb.conversationMessage.findMany({
      where: {
        conversationId,
        direction: ConversationMessageDirection.INBOUND,
        sentBy: ConversationMessageSentBy.CUSTOMER,
        body: { not: null },
        createdAt: before,
      },
      orderBy: { createdAt: "desc" },
      select: { body: true },
      take: BOT_INTENT_HISTORY,
    }),
    prismadb.whatsAppBotShadowRun.findMany({
      where: { conversationId, inboundMessageId: { not: inbound.id } },
      orderBy: { createdAt: "desc" },
      select: { plannedTypes: true, plannedCount: true, createdAt: true },
      take: 50,
    }),
    getActiveBotKeywords(storeId).catch(() => []),
  ]);

  const welcomeBody = formatBotReply(BUSINESS_FACT_TEMPLATES["welcome.body"]());
  const plannedOf = (row: { plannedTypes: Prisma.JsonValue }) => (Array.isArray(row.plannedTypes) ? (row.plannedTypes as string[]) : []);
  const lastBotMeta = lastBot?.metadata as { decision?: { outcome?: string } } | null;
  const windowStart = now.getTime() - BOT_MESSAGE_WINDOW_MS;

  const offerId = offeredProductId(lastBot);
  const offerFresh = Boolean(lastBot && isOfferFresh(lastBot.createdAt, inbound.createdAt));
  const orderReply = Boolean(
    parseOrderReply(candidate.body) &&
      offerId &&
      offerFresh &&
      (await prismadb.product.count({ where: { id: offerId, storeId, isArchived: false } })) > 0,
  );
  const latestOrder = await latestOrderRequest(conversationId, inbound.createdAt);
  const pendingOrder = Boolean(latestOrder?.fromBot && latestOrder.id === lastBot?.id && latestOrder.record.status === "pending");
  const append = parseAppendRequest(candidate.body);
  const orderAppend = Boolean(
    append &&
      pendingOrder &&
      offerFresh &&
      realOutcome === "skipped_needs_owner" &&
      !(conversation.lastOwnerAt && lastBot && conversation.lastOwnerAt >= lastBot.createdAt) &&
      (await countInStockMatches(storeId, append.query, null, { minTokens: 1 }).catch(() => null)) === 1,
  );

  const web = candidate.webOrigin && !candidate.webOrigin.extraText ? candidate.webOrigin : null;
  const webProductAvailable = Boolean(
    web?.pageType === "product" &&
      web.refs[0] &&
      (await prismadb.product.count({ where: { storeId, sku: web.refs[0], isArchived: false, stock: { gt: 0 } } })) > 0,
  );

  const ctx: ShadowContext = {
    botEnabled: enabled,
    ownerActive: describeBotPause(conversation.lastOwnerAt, now).paused,
    newerInbound: newer !== null,
    pending,
    // Un mensaje escrito solo se salta así si la conversación ya esperaba a Paula.
    waitingForPaula: realOutcome === "skipped_needs_owner",
    ownerEverWrote: conversation.lastOwnerAt !== null,
    lastBotWasNoMatch: Boolean(lastBot?.body?.startsWith(formatBotReply(deps.noMatchText)) || lastBotMeta?.decision?.outcome === "unsure"),
    firstMessage: earlierCount === 0,
    emojiOnly: isEmojiOnly(candidate.body),
    welcomeRecently:
      recentBot.some((row) => (row.metadata as { kind?: string } | null)?.kind === "welcome" || Boolean(row.body?.startsWith(welcomeBody))) ||
      shadowRows.some((row) => row.createdAt.getTime() >= now.getTime() - WELCOME_REPEAT_WINDOW_MS && plannedOf(row).includes("welcome")),
    catalogLinkBefore: shadowRows.some((row) => plannedOf(row).includes("catalog_link")),
    factsApproved: Boolean(settings && areBusinessFactsApproved(settings)),
    productsApproved: Boolean(settings && areProductAnswersApproved(settings)),
    // Se evalúa el bot que se enviaría: con los cuatro textos de cortesía ya aprobados por Paula.
    casualApproved: true,
    businessFact: classifyBusinessFact(candidate.body) !== null,
    welcomeGreeting: isWelcomeGreeting(candidate.body),
    keywordMatch: matchWhatsAppKeyword(candidate.body, keywords) !== null,
    looksLikeProduct: looksLikeProductQuestion(candidate.body),
    orderReply,
    orderAppend,
    shippingQuestion: isShippingCostQuestion(candidate.body),
    webOrigin: web?.pageType ?? null,
    webProductAvailable,
    recentPlannedMessages: shadowRows
      .filter((row) => row.createdAt.getTime() >= windowStart)
      .reduce((sum, row) => sum + row.plannedCount, 0),
  };
  return { ctx, previousTexts: previous.map((row) => row.body ?? "").filter(Boolean).reverse() };
}

/**
 * Corre después de que el bot real terminó con este mensaje. Nunca manda nada
 * ni toca la conversación: solo lee y escribe una fila en
 * `WhatsAppBotShadowRun`. Cualquier fallo se traga y se anota con su tipo.
 */
export async function runWhatsAppBotShadow(
  candidate: ShadowCandidate,
  realOutcome: string,
  realFinishedAt: Date,
  deps: ShadowDeps,
): Promise<void> {
  let stage = "load";
  try {
    if (!isShadowCandidate(candidate)) return;
    const [inbound, conversation] = await Promise.all([
      prismadb.conversationMessage.findFirst({
        where: { conversationId: candidate.conversationId, externalId: candidate.inboundMessageId },
        select: { id: true, createdAt: true },
      }),
      prismadb.conversation.findUnique({
        where: { id: candidate.conversationId },
        select: { storeId: true, lastOwnerAt: true },
      }),
    ]);
    if (!inbound || !conversation) return;

    const { ctx, previousTexts } = await loadContext(candidate, inbound, conversation, realOutcome, deps);
    let classifierStatus = "skipped";
    let understood: BotIntentResult | null = null;
    let search: ShadowSignals["search"] = { ran: false };

    const ruleIntent = ctx.webOrigin
      ? `web_${ctx.webOrigin}`
      : ctx.orderAppend
        ? "order_append"
        : ctx.orderReply
          ? "order_request"
          : ctx.shippingQuestion
            ? "shipping_quote"
            : null;
    if (!shadowGuard(ctx) && !ruleIntent) {
      stage = "classify";
      const outcome = await classifyMessageIntent(candidate.body, previousTexts);
      classifierStatus = outcome.ok ? "ok" : outcome.reason;
      understood = outcome.ok ? outcome.value : null;
      if (shadowWantsSearch(ctx, understood?.intent ?? null)) {
        stage = "search";
        const query = understood ? understood.query : fallbackQueryFromMessage(candidate.body);
        const total = query ? await countInStockMatches(conversation.storeId, query, understood?.filters.budget ?? null) : null;
        if (total !== null) search = { ran: true, found: total > 0 };
      }
    }

    stage = "real";
    const realRows = await prismadb.conversationMessage.findMany({
      where: {
        conversationId: candidate.conversationId,
        direction: ConversationMessageDirection.OUTBOUND,
        sentBy: ConversationMessageSentBy.BOT,
        status: { not: ConversationMessageStatus.FAILED },
        createdAt: { gte: inbound.createdAt, lte: realFinishedAt },
      },
      orderBy: { createdAt: "asc" },
      select: { body: true, metadata: true },
      take: 10,
    });
    const realTypes = realTypesFrom(realRows, realOutcome);
    const plan = planShadowReply(ctx, { intent: understood?.intent ?? null, search });

    stage = "record";
    await prismadb.whatsAppBotShadowRun.create({
      data: {
        storeId: conversation.storeId,
        conversationId: candidate.conversationId,
        inboundMessageId: inbound.id,
        intent: (!shadowGuard(ctx) && ruleIntent) || understood?.intent || null,
        plannedTypes: plan.types,
        plannedCount: plan.types.length,
        productsFound: search.ran ? search.found : null,
        searchRan: search.ran,
        realOutcome: realOutcome.slice(0, 48),
        realTypes,
        realCount: realTypes.length,
        classifierStatus,
        skipReason: plan.skipReason,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    console.error("[WHATSAPP_SHADOW] Falló el modo sombra", {
      conversationId: candidate.conversationId,
      stage,
      kind: error instanceof Error ? error.name : typeof error,
    });
  }
}
