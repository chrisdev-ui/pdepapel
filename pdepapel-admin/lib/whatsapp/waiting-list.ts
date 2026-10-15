import { ConversationMessageDirection, ConversationMessageStatus, type Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import { NO_MATCH_ACKNOWLEDGEMENT, TALK_TO_OWNER_ACKNOWLEDGEMENT, UNAVAILABLE_OPTION_ACKNOWLEDGEMENT, UNREADABLE_MEDIA_ACKNOWLEDGEMENT } from "@/lib/whatsapp/bot-acknowledgements";
import { WAITING_BADGE_AFTER_MS, currentWait, type Wait, type WaitMessage } from "@/lib/whatsapp/waiting";

const PROMISE_TEXTS = new Set([TALK_TO_OWNER_ACKNOWLEDGEMENT, NO_MATCH_ACKNOWLEDGEMENT, UNREADABLE_MEDIA_ACKNOWLEDGEMENT, UNAVAILABLE_OPTION_ACKNOWLEDGEMENT]);

const asRecord = (value: Prisma.JsonValue | null): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

/** Un mensaje del bot con la marca de «mensaje de espera» no cierra la espera: no es una respuesta. */
export const isHoldingMessage = (metadata: Prisma.JsonValue | null) => asRecord(metadata).holding === true;

interface LoadedWait {
  wait: Wait | null;
  /** Lo último que salió antes de la espera fue un aviso de que Paula escribe. */
  promised: boolean;
  /** Respuestas y mensajes de espera del bot en esta espera. */
  assistSends: number;
}

/** Lee la espera abierta de una conversación (las últimas 60 filas bastan). */
export async function loadWait(conversationId: string): Promise<LoadedWait> {
  const rows = (
    await prismadb.conversationMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 60,
      select: { id: true, direction: true, sentBy: true, body: true, mediaType: true, metadata: true, createdAt: true, status: true },
    })
  ).reverse();
  const holdings = rows.filter((row) => row.direction === ConversationMessageDirection.OUTBOUND && isHoldingMessage(row.metadata));
  const messages: WaitMessage[] = rows
    .filter((row) => !(row.direction === ConversationMessageDirection.OUTBOUND && (isHoldingMessage(row.metadata) || row.status === ConversationMessageStatus.FAILED)))
    .map((row) => ({
      id: row.id,
      direction: row.direction,
      sentBy: row.sentBy,
      body: row.body,
      mediaType: row.mediaType,
      createdAt: row.createdAt,
      edit: Boolean(asRecord(row.metadata).edit) && !row.body,
    }));
  const wait = currentWait(messages);
  if (!wait) return { wait: null, promised: false, assistSends: 0 };
  const lastOut = [...messages].reverse().find((message) => message.direction === "OUTBOUND" && message.createdAt <= wait.since);
  return {
    wait,
    promised: Boolean(lastOut && lastOut.sentBy === "BOT" && PROMISE_TEXTS.has((lastOut.body ?? "").trim())),
    assistSends: holdings.filter((row) => row.createdAt >= wait.since).length,
  };
}


/** Tope de candidatas que se revisan: las de mensaje más reciente. */
const CANDIDATE_LIMIT = 200;

/**
 * Las conversaciones donde la clienta escribió de último (algo de verdad, no
 * «ok» ni una reacción) y nadie le respondió hace al menos `minAgeMs`, con
 * desde cuándo espera. Candidatas por columnas (`lastInboundAt` más nuevo que
 * `lastOutboundAt`); el detalle se lee solo de esas. El mensaje de espera del
 * bot no cuenta como respuesta y no mueve `lastOutboundAt`.
 */
export async function findWaitingConversations(storeId: string, now = new Date(), minAgeMs = WAITING_BADGE_AFTER_MS, maxAgeMs = Infinity): Promise<Map<string, Date>> {
  const oldest = Number.isFinite(maxAgeMs) ? new Date(now.getTime() - maxAgeMs) : new Date(0);
  const candidates = await prismadb.$queryRaw<{ id: string }[]>`
    SELECT \`id\` FROM \`Conversation\`
     WHERE \`storeId\` = ${storeId}
       AND \`lastInboundAt\` IS NOT NULL
       AND \`lastInboundAt\` <= ${now}
       AND \`lastInboundAt\` >= ${oldest}
       AND (\`lastOutboundAt\` IS NULL OR \`lastInboundAt\` > \`lastOutboundAt\`)
     ORDER BY \`lastInboundAt\` DESC
     LIMIT ${CANDIDATE_LIMIT}`;
  const waiting = new Map<string, Date>();
  for (const { id } of candidates) {
    const { wait } = await loadWait(id);
    const age = wait ? now.getTime() - wait.since.getTime() : -1;
    if (wait && age >= minAgeMs && age <= maxAgeMs) waiting.set(id, wait.since);
  }
  return waiting;
}

export async function countWaitingConversations(storeId: string, now = new Date(), minAgeMs = WAITING_BADGE_AFTER_MS, maxAgeMs = Infinity): Promise<number> {
  return (await findWaitingConversations(storeId, now, minAgeMs, maxAgeMs)).size;
}
