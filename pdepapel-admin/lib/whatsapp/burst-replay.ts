import { ConversationMessageDirection, ConversationMessageSentBy } from "@prisma/client";

import {
  assembleBurst,
  burstIntentOf,
  burstIntentRank,
  type BurstChoice,
  type BurstContext,
  type BurstIntent,
  type BurstMessage,
  type BurstRow,
} from "@/lib/whatsapp/burst";

/**
 * Repetición del modo ráfaga sobre el historial real: con las mismas
 * funciones de producción (lib/whatsapp/burst.ts) se arma cada ráfaga y se
 * compara lo que eligiría el modo ráfaga con el mensaje al que el bot de
 * verdad le contestó. El vínculo mensaje → respuesta sale del modo sombra
 * (`WhatsAppBotShadowRun.inboundMessageId` con su `realCount`), nunca de la
 * cercanía de horas: lo que no tiene fila de sombra queda «sin vínculo».
 */
const REAL_INTENTS: BurstIntent[] = ["handoff", "order", "product", "fact", "web"];

export interface ReplayBurst {
  /** Mensajes de la ráfaga, como los leería producción al llegar el último. */
  messages: BurstMessage[];
}

/** Las ráfagas de 2 o más mensajes de una conversación, cada una tomada en su último mensaje. */
export function findBursts(rows: BurstRow[]): ReplayBurst[] {
  const isCustomerText = (row: BurstRow) =>
    row.direction === ConversationMessageDirection.INBOUND && row.sentBy === ConversationMessageSentBy.CUSTOMER && !row.mediaType && Boolean(row.body?.trim());
  const bursts: ReplayBurst[] = [];
  const texts = rows.map((row, index) => ({ row, index })).filter(({ row }) => isCustomerText(row));
  for (let position = 0; position < texts.length; position += 1) {
    const { row, index } = texts[position];
    const messages = assembleBurst(rows.slice(0, index + 1), row.id);
    const next = texts[position + 1];
    // Es el último de su ráfaga si el siguiente mensaje escrito ya no lo incluye.
    const continues = next ? assembleBurst(rows.slice(0, next.index + 1), next.row.id).some((message) => message.id === row.id) : false;
    if (!continues && messages.length >= 2) bursts.push({ messages });
  }
  return bursts;
}

export type ReplayComparison = "same" | "better" | "worse" | "same_intent_other_text";

export interface ReplayVerdict {
  /** Al menos un mensaje de la ráfaga tiene fila del modo sombra. */
  matched: boolean;
  /** El bot de verdad le contestó a algún mensaje de la ráfaga. */
  answered: boolean;
  answeredPosition: number | null;
  answeredIntent: BurstIntent | null;
  chosenPosition: number;
  chosenIntent: BurstIntent;
  comparison: ReplayComparison | null;
  /** Un mensaje anterior traía algo que se entiende y el bot contestó a otro que no. */
  lostEarlier: boolean;
  /** …y el modo ráfaga sí lo habría contestado. */
  fixedByBurst: boolean;
  /** Cuántas líneas junta la elección del modo ráfaga (2+ = une mensajes). */
  linesJoined: number;
  /** Mensajes de la ráfaga a los que el bot de verdad contestó por separado. */
  messagesAnswered: number;
}

export function judgeBurst(
  burst: ReplayBurst,
  choice: BurstChoice,
  shadow: Map<string, { realCount: number }>,
  ctx: BurstContext,
): ReplayVerdict {
  const rows = burst.messages.map((message) => shadow.get(message.id));
  const matched = rows.some(Boolean);
  const answeredIndexes = rows.map((row, index) => ((row?.realCount ?? 0) > 0 ? index : -1)).filter((index) => index >= 0);
  const answeredIndex = answeredIndexes.length ? answeredIndexes[answeredIndexes.length - 1] : -1;
  const answeredIntent = answeredIndex >= 0 ? burstIntentOf(burst.messages[answeredIndex].text, ctx) : null;
  const linesJoined = countJoined(burst.messages, choice);

  let comparison: ReplayComparison | null = null;
  if (answeredIntent) {
    const chosenRank = burstIntentRank(choice.intent);
    const answeredRank = burstIntentRank(answeredIntent);
    if (chosenRank < answeredRank) comparison = "better";
    else if (chosenRank > answeredRank) comparison = "worse";
    else comparison = choice.text === burst.messages[answeredIndex].text ? "same" : "same_intent_other_text";
  }
  const earlierReal = burst.messages
    .slice(0, answeredIndex >= 0 ? answeredIndex : 0)
    .some((message) => REAL_INTENTS.includes(burstIntentOf(message.text, ctx)));
  const lostEarlier = Boolean(answeredIntent && !REAL_INTENTS.includes(answeredIntent) && earlierReal);
  return {
    matched,
    answered: answeredIndex >= 0,
    answeredPosition: answeredIndex >= 0 ? answeredIndex + 1 : null,
    answeredIntent,
    chosenPosition: choice.position,
    chosenIntent: choice.intent,
    comparison,
    lostEarlier,
    fixedByBurst: lostEarlier && REAL_INTENTS.includes(choice.intent),
    linesJoined,
    messagesAnswered: answeredIndexes.length,
  };
}

/** Cuántos mensajes de la ráfaga quedaron dentro del texto elegido. */
function countJoined(messages: BurstMessage[], choice: BurstChoice): number {
  let rest = choice.text;
  let joined = 0;
  for (const message of messages.slice(choice.position - 1)) {
    if (rest.startsWith(message.text)) {
      joined += 1;
      rest = rest.slice(message.text.length).trimStart();
    }
  }
  return Math.max(1, joined);
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

export interface ReplaySummary {
  burstsFound: number;
  withoutShadowLink: number;
  matched: number;
  botAnswered: number;
  comparison: Record<ReplayComparison, number>;
  lostEarlierQuestion: number;
  burstModeWouldFix: number;
  worseCases: { position: { answered: number | null; chosen: number }; intents: { answered: BurstIntent | null; chosen: BurstIntent } }[];
  joinsTwoOrMoreLines: number;
  extraDelaySeconds: { p50: number; p90: number };
  repliesSaved: number;
}

/**
 * El modo ráfaga contesta al llegar el último mensaje, igual que hoy (los
 * anteriores ya se saltan por «llegó otro después»): no agrega espera. Se
 * informa la espera adicional medida como 0 para cada ráfaga contestada.
 */
export function summarizeReplay(verdicts: ReplayVerdict[]): ReplaySummary {
  const answered = verdicts.filter((verdict) => verdict.answered);
  const comparison: Record<ReplayComparison, number> = { same: 0, better: 0, worse: 0, same_intent_other_text: 0 };
  for (const verdict of answered) if (verdict.comparison) comparison[verdict.comparison] += 1;
  const delays = answered.map(() => 0);
  return {
    burstsFound: verdicts.length,
    withoutShadowLink: verdicts.filter((verdict) => !verdict.matched).length,
    matched: verdicts.filter((verdict) => verdict.matched).length,
    botAnswered: answered.length,
    comparison,
    lostEarlierQuestion: answered.filter((verdict) => verdict.lostEarlier).length,
    burstModeWouldFix: answered.filter((verdict) => verdict.fixedByBurst).length,
    worseCases: answered
      .filter((verdict) => verdict.comparison === "worse")
      .map((verdict) => ({
        position: { answered: verdict.answeredPosition, chosen: verdict.chosenPosition },
        intents: { answered: verdict.answeredIntent, chosen: verdict.chosenIntent },
      })),
    joinsTwoOrMoreLines: answered.filter((verdict) => verdict.linesJoined >= 2).length,
    extraDelaySeconds: { p50: percentile(delays, 50), p90: percentile(delays, 90) },
    repliesSaved: answered.reduce((sum, verdict) => sum + Math.max(0, verdict.messagesAnswered - 1), 0),
  };
}
