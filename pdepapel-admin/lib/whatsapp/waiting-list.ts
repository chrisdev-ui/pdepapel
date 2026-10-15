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

/** «Marcar como atendido» cierra la espera como si Paula hubiera escrito en ese momento, sin mandarle nada a la clienta. */
const attendedMark = (at: Date): WaitMessage => ({ id: "attended", direction: "OUTBOUND", sentBy: "OWNER", body: null, mediaType: null, createdAt: at });

/**
 * Lee la espera abierta de una conversación (las últimas 60 filas bastan).
 * `attendedAt` es `Conversation.waitAttendedAt`; si no se pasa, se lee.
 */
export async function loadWait(conversationId: string, attendedAt?: Date | null): Promise<LoadedWait> {
  const [found, attended] = await Promise.all([
    prismadb.conversationMessage.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 60,
      select: { id: true, direction: true, sentBy: true, body: true, mediaType: true, metadata: true, createdAt: true, status: true },
    }),
    attendedAt === undefined
      ? prismadb.conversation.findUnique({ where: { id: conversationId }, select: { waitAttendedAt: true } }).then((row) => row?.waitAttendedAt ?? null)
      : attendedAt,
  ]);
  const rows = found.reverse();
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
  if (attended) {
    const at = messages.findIndex((message) => message.createdAt > attended);
    messages.splice(at === -1 ? messages.length : at, 0, attendedMark(attended));
  }
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
 * `lastOutboundAt` y que `waitAttendedAt`); el detalle se lee solo de esas. El mensaje de espera del
 * bot no cuenta como respuesta y no mueve `lastOutboundAt`.
 */
export async function findWaitingConversations(storeId: string, now = new Date(), minAgeMs = WAITING_BADGE_AFTER_MS, maxAgeMs = Infinity): Promise<Map<string, Date>> {
  const oldest = Number.isFinite(maxAgeMs) ? new Date(now.getTime() - maxAgeMs) : new Date(0);
  const candidates = await prismadb.$queryRaw<{ id: string; waitAttendedAt: Date | null }[]>`
    SELECT \`id\`, \`waitAttendedAt\` FROM \`Conversation\`
     WHERE \`storeId\` = ${storeId}
       AND \`lastInboundAt\` IS NOT NULL
       AND \`lastInboundAt\` <= ${now}
       AND \`lastInboundAt\` >= ${oldest}
       AND (\`lastOutboundAt\` IS NULL OR \`lastInboundAt\` > \`lastOutboundAt\`)
       AND (\`waitAttendedAt\` IS NULL OR \`lastInboundAt\` > \`waitAttendedAt\`)
     ORDER BY \`lastInboundAt\` DESC
     LIMIT ${CANDIDATE_LIMIT}`;
  const waiting = new Map<string, Date>();
  for (const { id, waitAttendedAt } of candidates) {
    const { wait } = await loadWait(id, waitAttendedAt);
    const age = wait ? now.getTime() - wait.since.getTime() : -1;
    if (wait && age >= minAgeMs && age <= maxAgeMs) waiting.set(id, wait.since);
  }
  return waiting;
}

export async function countWaitingConversations(storeId: string, now = new Date(), minAgeMs = WAITING_BADGE_AFTER_MS, maxAgeMs = Infinity): Promise<number> {
  return (await findWaitingConversations(storeId, now, minAgeMs, maxAgeMs)).size;
}

/** Tope de conversaciones por «Marcar como atendidas»: la lista de esperas nunca pasa de las 200 candidatas. */
export const MAX_ATTENDED_PER_REQUEST = CANDIDATE_LIMIT;

/**
 * «Marcar como atendido»: cierra la espera sin mandarle nada a la clienta.
 * Lo que ella escribió hasta `now` deja de contar; si vuelve a escribir, la
 * espera vuelve. Las revisiones pendientes del bot (respuesta y mensaje de
 * espera) encuentran la espera cerrada y no mandan nada.
 */
export async function markWaitsAttended(storeId: string, conversationIds: readonly string[], userId: string, now = new Date()): Promise<number> {
  if (conversationIds.length === 0) return 0;
  const { count } = await prismadb.conversation.updateMany({
    where: { storeId, id: { in: [...conversationIds] } },
    data: { waitAttendedAt: now, waitAttendedBy: userId },
  });
  return count;
}
