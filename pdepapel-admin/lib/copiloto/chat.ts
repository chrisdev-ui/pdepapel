import { createOpenAI } from "@ai-sdk/openai";
import { Prisma } from "@prisma/client";
import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { providerSkipKey } from "@/lib/ai-provider";
import { getAiRoutingStore } from "@/lib/ai-model-providers";
import { checkCopilotBudget, recordCopilotSpend, type CopilotBudgetStore } from "@/lib/copiloto/budget";
import {
  COPILOT_DEEP_MODEL,
  COPILOT_FAST_MODEL,
  COPILOT_MAX_STEPS,
  COPILOT_RATE_LIMIT_PER_DAY,
  COPILOT_RATE_LIMIT_PER_HOUR,
  COPILOT_RESERVE_USD,
  COPILOT_TIMEOUT_MS,
  estimateCopilotCostUsd,
  isCopilotConfigured,
} from "@/lib/copiloto/config";
import { getKnowledgeNotes } from "@/lib/copiloto/knowledge";
import { buildCopilotContext, buildCopilotSystemPrompt } from "@/lib/copiloto/prompt";
import {
  COPILOT_VISIBLE_ROLES,
  parseSkillCommand,
  readSkillState,
  recordSkillEvent,
  type SkillState,
} from "@/lib/copiloto/skill-state";
import { activeToolNames, getCopilotSkill } from "@/lib/copiloto/skills";
import { plainWordsTransform } from "@/lib/copiloto/plain-words";
import { kitsAnswerTransform } from "@/lib/copiloto/skills/kits-transform";
import { specCheckTransform } from "@/lib/copiloto/skills/specs";
import { buildSkillTools } from "@/lib/copiloto/skills/tools";
import { COPILOT_TOOL_NAMES, buildCopilotTools } from "@/lib/copiloto/tools";
import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requireStoreOwner } from "@/lib/store-access";

export const copilotChatRequestSchema = z.object({
  id: z.string().uuid(),
  message: z.object({ id: z.string().min(1).max(64), role: z.literal("user"), parts: z.array(z.any()).min(1).max(20) }).passthrough(),
  screen: z.string().max(200).nullish(),
  mode: z.enum(["rapido", "a_fondo"]).default("rapido"),
  /** «Responder de nuevo»: reemplaza la última respuesta en vez de agregar otra. */
  regenerar: z.boolean().default(false),
  /** Habilidades que Paula fijó antes de la primera pregunta (la conversación todavía no existía). */
  habilidades: z.array(z.string().max(40)).max(5).default([]),
});

/** Cuántos mensajes anteriores viajan al modelo: acota el costo de una conversación larga. */
export const COPILOT_HISTORY_LIMIT = 20;

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const textOf = (message: { parts: unknown[] }) =>
  message.parts
    .map((part) => (part && typeof part === "object" && (part as { type?: string }).type === "text" ? String((part as { text?: string }).text ?? "") : ""))
    .join(" ")
    .trim();

export interface CopilotChatDeps {
  /** Lo pone la ruta, que ya comprobó que es la dueña. */
  userId?: string;
  budgetStore?: CopilotBudgetStore | null;
  openaiKey?: string | null;
  /** Solo para pruebas: el modelo, en vez del de OpenAI. */
  languageModel?: (modelId: string) => LanguageModel;
  now?: () => Date;
}

type UserMessage = z.infer<typeof copilotChatRequestSchema>["message"];

/** Abre la conversación propia o la crea; `null` si es de otra persona o de otra tienda. */
async function openConversation(conversationId: string, storeId: string, userId: string, question: string): Promise<"existing" | "created" | null> {
  const conversation = await prismadb.assistantConversation.findUnique({ where: { id: conversationId }, select: { storeId: true, userId: true } });
  if (conversation) return conversation.storeId === storeId && conversation.userId === userId ? "existing" : null;
  await prismadb.assistantConversation.create({ data: { id: conversationId, storeId, userId, title: question.slice(0, 120) } });
  return "created";
}

async function saveUserMessage(conversationId: string, message: UserMessage) {
  await prismadb.assistantMessage.upsert({
    where: { id: message.id },
    create: { id: message.id, conversationId, role: "user", parts: message.parts as Prisma.InputJsonValue },
    update: {},
  });
  await prismadb.assistantConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
}

/**
 * «Responder de nuevo»: borra la respuesta que sigue a esa pregunta (y lo que
 * vino después), para que el historial quede con una sola. Se anota quién
 * corrigió y qué había elegido el copiloto.
 */
async function dropLastAnswer(conversationId: string, userMessageId: string) {
  const question = await prismadb.assistantMessage.findFirst({
    where: { id: userMessageId, conversationId, role: "user" },
    select: { createdAt: true },
  });
  if (!question) return;
  const answers = await prismadb.assistantMessage.findMany({
    where: { conversationId, role: "assistant", createdAt: { gte: question.createdAt } },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const before = await readSkillState(conversationId);
  if (answers.length) await prismadb.assistantMessage.deleteMany({ where: { id: { in: answers.map((answer) => answer.id) } } });
  await recordSkillEvent(conversationId, { action: "regenerated", skillId: null, modelChosenSkills: before.modelChosen, messageId: answers[0]?.id ?? null });
}

function skillCommandReply(command: { action: "added" | "removed"; skillId: string }): string {
  const name = getCopilotSkill(command.skillId)?.nombre ?? command.skillId;
  return command.action === "removed"
    ? `Listo, dejo de usar ${name} en esta conversación. Si quieres, toca «Responder de nuevo» o vuelve a preguntar.`
    : `Listo, uso ${name} en esta conversación. ¿Qué necesitas?`;
}

/** Respuesta fija, sin el modelo: se guarda como cualquier otra y viaja con el estado de las habilidades. */
async function cannedAnswer(conversationId: string, text: string, state: SkillState): Promise<Response> {
  const id = createIdGenerator({ prefix: "cop", size: 24 })();
  await prismadb.assistantMessage.create({
    data: { id, conversationId, role: "assistant", parts: [{ type: "text", text }] as unknown as Prisma.InputJsonValue },
  });
  const habilidades = { loaded: state.loaded, pinned: state.pinned, blocked: state.blocked };
  return createUIMessageStreamResponse({
    headers: { "cache-control": "no-store" },
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: id, messageMetadata: { habilidades } });
        writer.write({ type: "text-start", id: "t" });
        writer.write({ type: "text-delta", id: "t", delta: text });
        writer.write({ type: "text-end", id: "t" });
        writer.write({ type: "finish", messageMetadata: { habilidades } });
      },
    }),
  });
}

/**
 * El texto de una habilidad ya viaja en el mensaje de contexto: en el
 * historial, su `cargarHabilidad` queda solo como «cargada», para no mandarlo
 * dos veces.
 */
function withoutSkillText(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts;
  return parts.map((part) => {
    const value = part as { type?: string; state?: string; output?: { ok?: boolean; id?: string } };
    if (value?.type !== "tool-cargarHabilidad" || value.state !== "output-available" || !value.output?.ok) return part;
    return { ...value, output: { ok: true, id: value.output.id, cargada: true } };
  });
}

/**
 * La ruta del chat: dueña, límites, presupuesto, historial, y la respuesta en
 * streaming (protocolo de mensajes de AI SDK 7 sobre SSE). Se consume en el
 * servidor aunque la clienta del navegador se desconecte, para guardarla.
 */
export async function handleCopilotChat(request: Request, storeId: string, deps: CopilotChatDeps = {}): Promise<Response> {
  if (!isCopilotConfigured()) return json(503, "El copiloto no está configurado.");
  const userId = deps.userId ?? (await requireStoreOwner(storeId));

  const parsed = copilotChatRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, "Mensaje inválido.");
  const { id: conversationId, message, screen, mode, regenerar, habilidades } = parsed.data;
  const question = textOf(message);
  if (!question || question.length > 2000) return json(400, "Escribe una pregunta de hasta 2.000 caracteres.");

  const [perHour, perDay] = await Promise.all([
    consumeRateLimit({ key: `copiloto:h:${userId}`, limit: COPILOT_RATE_LIMIT_PER_HOUR, windowSeconds: 3600 }),
    consumeRateLimit({ key: `copiloto:d:${userId}`, limit: COPILOT_RATE_LIMIT_PER_DAY, windowSeconds: 86_400 }),
  ]);
  if (!perHour.allowed || !perDay.allowed) return json(429, "Muchas preguntas seguidas. Espera un rato y vuelve a intentar.");

  // «no uses marketing», «usa descripciones»: se resuelve aquí, sin el modelo ni presupuesto.
  const command = regenerar ? null : parseSkillCommand(question);
  if (command) {
    if (!(await openConversation(conversationId, storeId, userId, question))) return json(404, "Conversación no encontrada.");
    await saveUserMessage(conversationId, message);
    const before = await readSkillState(conversationId);
    await recordSkillEvent(conversationId, { action: command.action, skillId: command.skillId, modelChosenSkills: before.modelChosen, messageId: message.id });
    return cannedAnswer(conversationId, skillCommandReply(command), await readSkillState(conversationId));
  }

  const openaiKey = deps.openaiKey === undefined ? env.OPENAI_API_KEY : deps.openaiKey;
  if (!openaiKey) return json(503, "El copiloto no está disponible ahora.");

  const store = deps.budgetStore === undefined ? (getAiRoutingStore() as unknown as CopilotBudgetStore | null) : deps.budgetStore;
  const now = deps.now?.() ?? new Date();
  const wantsDeep = mode === "a_fondo";
  const budget = await checkCopilotBudget(store, COPILOT_RESERVE_USD[wantsDeep ? COPILOT_DEEP_MODEL : COPILOT_FAST_MODEL], now);
  if (!budget.ok) {
    return json(
      503,
      budget.reason === "unavailable"
        ? "No pude revisar el presupuesto del copiloto. Intenta en un momento."
        : budget.reason === "daily"
          ? "Llegamos al presupuesto de hoy del copiloto. Mañana sigue."
          : "Llegamos al presupuesto de este mes del copiloto.",
    );
  }
  try {
    if (await store?.get(providerSkipKey("openai"))) return json(503, "El copiloto está ocupado. Intenta en unos minutos.");
  } catch {
    return json(503, "No pude revisar el estado del copiloto. Intenta en un momento.");
  }
  const model = wantsDeep && budget.deepAllowed ? COPILOT_DEEP_MODEL : COPILOT_FAST_MODEL;

  const opened = await openConversation(conversationId, storeId, userId, question);
  if (!opened) return json(404, "Conversación no encontrada.");
  if (opened === "created") {
    for (const skillId of habilidades.filter((id) => getCopilotSkill(id))) {
      await recordSkillEvent(conversationId, { action: "added", skillId, modelChosenSkills: [], messageId: message.id });
    }
  }
  if (regenerar) await dropLastAnswer(conversationId, message.id);
  // Elegidas por el copiloto en TODA la conversación, más las fijadas y menos las que Paula quitó.
  const skillState = await readSkillState(conversationId);
  const loadedBefore = skillState.loaded;
  const previous = await prismadb.assistantMessage.findMany({
    where: { conversationId, role: { in: [...COPILOT_VISIBLE_ROLES] } },
    orderBy: { createdAt: "desc" },
    take: COPILOT_HISTORY_LIMIT,
    select: { id: true, role: true, parts: true },
  });

  const notes = await getKnowledgeNotes(storeId);
  const approved = notes.filter((note) => note.approved);
  const tools = {
    ...buildCopilotTools(storeId),
    ...buildSkillTools(storeId, {
      alreadyLoaded: loadedBefore,
      blocked: skillState.blocked,
      notesFor: async (skillId) => approved.filter((note) => note.habilidad === skillId),
    }),
  };
  const messages = await validateUIMessages<UIMessage>({
    messages: [
      ...previous.reverse().map((row) => ({ id: row.id, role: row.role as UIMessage["role"], parts: withoutSkillText(row.parts) as UIMessage["parts"] })),
      message as unknown as UIMessage,
    ],
    tools: tools as never,
  });
  await saveUserMessage(conversationId, message);

  const system = buildCopilotSystemPrompt({ knowledge: approved });
  const context = buildCopilotContext({
    knowledge: approved,
    loadedSkills: loadedBefore,
    blockedSkills: skillState.blocked,
    now,
    screen: screen ?? null,
    pendingBrands: notes.filter((note) => note.tema === "marcas" && !note.approved).map((note) => note.titulo),
  });
  const modelMessages = await convertToModelMessages(messages);
  // Lo variable va justo antes de la pregunta: el prefijo (sistema fijo + historial) queda igual y se reutiliza de la caché.
  modelMessages.splice(modelMessages.length - 1, 0, { role: "system", content: context });
  const loaded = new Set(loadedBefore);

  const languageModel = deps.languageModel?.(model) ?? createOpenAI({ apiKey: openaiKey })(model);
  const startedAt = Date.now();
  const toolCalls: { name: string; ok: boolean }[] = [];
  let resolveUsage: (usage: { inputTokens: number; cachedInputTokens: number; outputTokens: number; costUsd: number }) => void = () => undefined;
  const usageReady = new Promise<{ inputTokens: number; cachedInputTokens: number; outputTokens: number; costUsd: number }>((resolve) => {
    resolveUsage = resolve;
  });

  const result = streamText({
    model: languageModel,
    system,
    messages: modelMessages,
    allowSystemInMessages: true,
    tools,
    activeTools: activeToolNames(COPILOT_TOOL_NAMES, loaded) as (keyof typeof tools)[],
    // Una habilidad cargada en este mismo turno activa sus herramientas desde el paso siguiente.
    prepareStep: ({ steps }) => {
      for (const step of steps) {
        for (const toolResult of step.toolResults ?? []) {
          const output = toolResult.output as { ok?: boolean; id?: string } | undefined;
          if (toolResult.toolName === "cargarHabilidad" && output?.ok && output.id && !skillState.blocked.includes(output.id)) loaded.add(output.id);
        }
      }
      return { activeTools: activeToolNames(COPILOT_TOOL_NAMES, loaded) as (keyof typeof tools)[] };
    },
    // Al final, sin otra llamada: aviso de especificaciones que faltan, la respuesta de kits armada por el código y, para toda respuesta, palabras simples en vez de nombres internos.
    experimental_transform: [specCheckTransform(), kitsAnswerTransform(), plainWordsTransform()],
    stopWhen: isStepCount(COPILOT_MAX_STEPS),
    abortSignal: AbortSignal.timeout(COPILOT_TIMEOUT_MS),
    maxRetries: 0,
    providerOptions: {
      openai: {
        store: false,
        reasoningEffort: model === COPILOT_FAST_MODEL ? "none" : "low",
        reasoningSummary: null,
        promptCacheKey: `copiloto:${storeId}`,
      },
    },
    onStepEnd: (step) => {
      for (const call of step.toolCalls ?? []) toolCalls.push({ name: call.toolName, ok: true });
      for (const error of (step.content ?? []).filter((part) => part.type === "tool-error")) {
        toolCalls.push({ name: (error as { toolName: string }).toolName, ok: false });
      }
      const usage = step.usage;
      console.info("[AI_MODEL_CALL]", {
        step: "copiloto",
        feature: "copiloto.chat",
        skills: Array.from(loaded),
        provider: "openai",
        model,
        inputTokens: usage.inputTokens ?? 0,
        cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        usd: estimateCopilotCostUsd(model, {
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens,
          outputTokens: usage.outputTokens,
        }),
        tools: (step.toolCalls ?? []).map((call) => call.toolName),
        ok: true,
      });
    },
    onEnd: async ({ totalUsage }) => {
      const usage = {
        inputTokens: totalUsage.inputTokens ?? 0,
        cachedInputTokens: totalUsage.inputTokenDetails?.cacheReadTokens ?? 0,
        outputTokens: totalUsage.outputTokens ?? 0,
      };
      const costUsd = estimateCopilotCostUsd(model, usage);
      await recordCopilotSpend(store, costUsd, now);
      resolveUsage({ ...usage, costUsd });
    },
    onError: ({ error }) => {
      console.error("[COPILOTO] La respuesta falló", { message: error instanceof Error ? error.message.slice(0, 200) : "unknown" });
      resolveUsage({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costUsd: 0 });
    },
  });
  result.consumeStream();

  return createUIMessageStreamResponse({
    headers: { "cache-control": "no-store" },
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      originalMessages: messages,
      sendReasoning: false,
      generateMessageId: createIdGenerator({ prefix: "cop", size: 24 }),
      messageMetadata: ({ part }) =>
        part.type === "finish"
          ? {
              model,
              mode: model === COPILOT_DEEP_MODEL ? "a_fondo" : "rapido",
              habilidades: { loaded: Array.from(loaded), pinned: skillState.pinned, blocked: skillState.blocked },
            }
          : undefined,
      onError: () => "No pude terminar la respuesta. Intenta de nuevo.",
      onEnd: async ({ messages: finalMessages }) => {
        const answer = finalMessages[finalMessages.length - 1];
        if (!answer || answer.role !== "assistant") return;
        const usage = await Promise.race([
          usageReady,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        await prismadb.assistantMessage
          .upsert({
            where: { id: answer.id },
            create: {
              id: answer.id,
              conversationId,
              role: "assistant",
              parts: answer.parts as unknown as Prisma.InputJsonValue,
              model,
              inputTokens: usage?.inputTokens ?? null,
              cachedInputTokens: usage?.cachedInputTokens ?? null,
              outputTokens: usage?.outputTokens ?? null,
              costUsd: usage ? new Prisma.Decimal(usage.costUsd.toFixed(6)) : null,
              latencyMs: Date.now() - startedAt,
              toolCalls: toolCalls as unknown as Prisma.InputJsonValue,
            },
            update: { parts: answer.parts as unknown as Prisma.InputJsonValue },
          })
          .catch((error) => console.error("[COPILOTO] No se pudo guardar la respuesta", { message: error?.message?.slice(0, 200) }));
      },
    }),
  });
}
