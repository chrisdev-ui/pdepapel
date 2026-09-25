import { createHash } from "node:crypto";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { ConversationMessageDirection } from "@prisma/client";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";

import { logModelUsage } from "@/lib/ai-usage";
import { AppError, ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { parseStoredTriggers } from "@/lib/whatsapp/bot-replies";
import {
  BOT_REPLY_ASSISTANT_CACHE_TTL_SECONDS,
  BOT_REPLY_ASSISTANT_DAILY_LIMIT,
  BOT_REPLY_ASSISTANT_MAX_MESSAGES,
  botReplyAssistantOutputSchema,
  botReplyAssistantRequestSchema,
  buildBotReplyAssistantPrompt,
  getBotReplyAssistantCacheKey,
  getBotReplyAssistantRateLimitKey,
  sanitizeAssistantNote,
  sanitizeBotReplyProposals,
  selectUnansweredMessages,
} from "@/lib/whatsapp/bot-reply-assistant";

/**
 * Propone respuestas automáticas a partir de lo que las clientas preguntaron
 * y el bot no supo contestar. No guarda nada: devuelve borradores que la dueña
 * revisa y confirma en el formulario de siempre.
 */

const RATE_LIMIT_EXPIRY_SECONDS = 60 * 60 * 48;
/** Solo se miran conversaciones recientes: el año pasado ya no representa. */
const LOOKBACK_DAYS = 180;
const MAX_CONVERSATIONS = 500;

function getModelError(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  // El modelo contestó algo que no encaja en el esquema. Es un fallo nuestro o
  // suyo, no de quien está usando el panel: se dice en cristiano y con 422.
  if (/No object generated|did not match schema|AI_NoObjectGenerated/i.test(message)) {
    return new AppError(
      "El asistente devolvió una respuesta que no se pudo leer. Vuelve a intentarlo.",
      422,
    );
  }

  if (/quota|resource_exhausted|rate limit|\b429\b/i.test(message)) {
    return new AppError(
      "Se alcanzó el límite gratuito del asistente. Intenta nuevamente más tarde.",
      429,
    );
  }

  return error;
}

async function reserveDailyRun(redis: Redis, storeId: string) {
  const key = getBotReplyAssistantRateLimitKey(storeId);
  const count = await redis.incr(key);

  if (count === 1) await redis.expire(key, RATE_LIMIT_EXPIRY_SECONDS);

  if (count > BOT_REPLY_ASSISTANT_DAILY_LIMIT) {
    throw new AppError(
      `Ya usaste las ${BOT_REPLY_ASSISTANT_DAILY_LIMIT} consultas del asistente disponibles hoy. Intenta de nuevo mañana.`,
      429,
    );
  }

  return BOT_REPLY_ASSISTANT_DAILY_LIMIT - count;
}

async function getRemainingDailyRuns(redis: Redis, storeId: string) {
  const count = await redis.get<number>(
    getBotReplyAssistantRateLimitKey(storeId),
  );

  return Math.max(
    0,
    BOT_REPLY_ASSISTANT_DAILY_LIMIT -
      (typeof count === "number" ? count : 0),
  );
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    if (!env.GEMINI_API_KEY) {
      throw new AppError(
        "El asistente aún no está configurado. Agrega GEMINI_API_KEY antes de usarlo.",
        503,
      );
    }

    const payload = botReplyAssistantRequestSchema.parse(await req.json());

    const [store, replies] = await Promise.all([
      prismadb.store.findFirst({
        where: { id: params.storeId },
        select: { name: true },
      }),
      prismadb.whatsAppBotReply.findMany({
        where: { storeId: params.storeId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { label: true, triggers: true, answer: true, isActive: true },
      }),
    ]);
    if (!store) throw ErrorFactory.NotFound("La tienda no existe");

    // Solo las activas compiten por una frase; una apagada no se dispara.
    const activeReplies = replies
      .filter((reply) => reply.isActive)
      .map((reply) => ({
        label: reply.label,
        triggers: parseStoredTriggers(reply.triggers),
        answer: reply.answer,
      }))
      .filter((reply) => reply.triggers.length > 0);

    let messages: string[] = [];

    if (payload.mode === "conversations") {
      const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const conversations = await prismadb.conversation.findMany({
        where: { storeId: params.storeId },
        // `lastInboundAt` es lo que importa aquí (y tiene índice): buscamos
        // conversaciones donde la clienta escribió, no donde escribimos nosotros.
        orderBy: { lastInboundAt: "desc" },
        take: MAX_CONVERSATIONS,
        select: { id: true },
      });

      if (conversations.length > 0) {
        const inbound = await prismadb.conversationMessage.findMany({
          where: {
            conversationId: { in: conversations.map((item) => item.id) },
            direction: ConversationMessageDirection.INBOUND,
            createdAt: { gte: since },
          },
          orderBy: { createdAt: "desc" },
          take: BOT_REPLY_ASSISTANT_MAX_MESSAGES * 3,
          select: { body: true, createdAt: true },
        });

        messages = selectUnansweredMessages(
          inbound
            .filter((message): message is { body: string; createdAt: Date } =>
              Boolean(message.body?.trim()),
            )
            .map((message) => ({ body: message.body, createdAt: message.createdAt })),
          activeReplies,
        );
      }

      if (messages.length === 0) {
        return NextResponse.json(
          {
            proposals: [],
            note: activeReplies.length
              ? "No quedaron mensajes sin contestar en los últimos meses: tus respuestas actuales están cubriendo lo que te preguntan."
              : "Todavía no hay mensajes de clientas para analizar. Cuando lleguen, vuelve aquí y te propongo respuestas con lo que preguntaron de verdad.",
            remainingToday: await getRemainingDailyRuns(
              Redis.fromEnv(),
              params.storeId,
            ),
            reused: false,
            analyzedMessages: 0,
          },
          { headers: CACHE_HEADERS.NO_CACHE },
        );
      }
    }

    const redis = Redis.fromEnv();
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          mode: payload.mode,
          topic: payload.topic ?? null,
          triggers: activeReplies.flatMap((reply) => reply.triggers).sort(),
          messages,
        }),
      )
      .digest("hex")
      .slice(0, 32);
    const cacheKey = getBotReplyAssistantCacheKey(params.storeId, fingerprint);

    const cached = botReplyAssistantOutputSchema.safeParse(
      await redis.get(cacheKey),
    );
    if (cached.success) {
      return NextResponse.json(
        {
          proposals: sanitizeBotReplyProposals(cached.data, activeReplies),
          note: sanitizeAssistantNote(cached.data.note),
          remainingToday: await getRemainingDailyRuns(redis, params.storeId),
          reused: true,
          analyzedMessages: messages.length,
        },
        { headers: CACHE_HEADERS.NO_CACHE },
      );
    }

    const remainingToday = await reserveDailyRun(redis, params.storeId);

    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    let result;
    try {
      result = await generateText({
        model: google("gemini-3.5-flash-lite"),
        output: Output.object({ schema: botReplyAssistantOutputSchema }),
        prompt: buildBotReplyAssistantPrompt({
          mode: payload.mode,
          topic: payload.topic,
          storeName: store.name,
          existingLabels: replies.map((reply) => reply.label),
          existingTriggers: activeReplies.flatMap((reply) => reply.triggers),
          messages,
        }),
      });
    } catch (error) {
      throw getModelError(error);
    }
    logModelUsage("bot-replies.assistant", result.usage);

    if (!result.output) {
      throw new AppError(
        "No fue posible redactar una propuesta esta vez. Intenta de nuevo.",
        422,
      );
    }

    try {
      await redis.set(cacheKey, result.output, {
        ex: BOT_REPLY_ASSISTANT_CACHE_TTL_SECONDS,
      });
    } catch (cacheError) {
      console.error(
        "[BOT_REPLY_ASSISTANT_CACHE_SET] No se pudo guardar la propuesta",
        cacheError,
      );
    }

    return NextResponse.json(
      {
        proposals: sanitizeBotReplyProposals(result.output, activeReplies),
        note: sanitizeAssistantNote(result.output.note),
        remainingToday,
        reused: false,
        analyzedMessages: messages.length,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "BOT_REPLY_ASSISTANT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 422, 429, 503],
    });
  }
}
