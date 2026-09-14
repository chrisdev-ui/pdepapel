import { z } from "zod";

import {
  BOT_REPLY_ANSWER_MAX_LENGTH,
  BOT_REPLY_MAX_TRIGGERS,
  parseTriggerLines,
} from "@/lib/whatsapp/bot-replies";
import {
  WHATSAPP_BOT_MARKER,
  matchWhatsAppKeyword,
  normalizeBotText,
  type WhatsAppBotKeyword,
} from "@/lib/whatsapp/bot-matching";

/**
 * Asistente de respuestas automáticas.
 *
 * Para qué existe: la pantalla de respuestas arranca vacía y hay que
 * imaginarse, desde cero, qué pregunta la gente y con qué palabras. Esto lee
 * los mensajes que de verdad llegaron y que el bot NO supo contestar, y
 * propone respuestas listas para revisar.
 *
 * Nada se guarda solo. Cada propuesta abre el formulario de siempre con los
 * campos llenos, y ella decide.
 */

export const BOT_REPLY_ASSISTANT_DAILY_LIMIT = 10;
export const BOT_REPLY_ASSISTANT_CACHE_TTL_SECONDS = 60 * 60 * 6;
export const BOT_REPLY_ASSISTANT_MAX_PROPOSALS = 4;
export const BOT_REPLY_ASSISTANT_MAX_MESSAGES = 200;
/** Un disparador de una o dos letras aparecería dentro de casi todo. */
export const BOT_REPLY_MIN_TRIGGER_LENGTH = 3;

// --- Entrada ---------------------------------------------------------------

export const botReplyAssistantRequestSchema = z
  .object({
    /**
     * `conversations`: mira lo que quedó sin responder.
     * `topic`: ella dice de qué quiere una respuesta y el asistente la redacta.
     */
    mode: z.enum(["conversations", "topic"]),
    topic: z.string().trim().max(300).optional(),
  })
  .refine((value) => value.mode !== "topic" || Boolean(value.topic), {
    message: "Escribe de qué quieres la respuesta",
    path: ["topic"],
  });

export type BotReplyAssistantRequest = z.infer<
  typeof botReplyAssistantRequestSchema
>;

// --- Salida del modelo -----------------------------------------------------

/**
 * El esquema describe la FORMA, no los largos.
 *
 * Aprendido en producción el 2026-09-14: el modelo escribió una nota de 334
 * caracteres contra un tope de 300 y Zod tumbó la respuesta entera —una
 * respuesta por lo demás correcta— con un 500. Un texto que solo se muestra
 * nunca debe poder invalidar todo el análisis. Los recortes los hace
 * `sanitizeBotReplyProposals`, que es donde de verdad importan.
 */
export const botReplyAssistantOutputSchema = z.object({
  proposals: z
    .array(
      z.object({
        label: z.string(),
        triggers: z.array(z.string()).max(BOT_REPLY_MAX_TRIGGERS),
        answer: z.string(),
        /** Por qué vale la pena, en una línea que ella pueda juzgar. */
        reason: z.string(),
        /** Mensajes reales que la motivaron, ya recortados. */
        examples: z.array(z.string()).max(3).default([]),
        /** El modelo marca lo que no puede saber (precios, horarios reales). */
        needsReview: z.boolean().default(false),
      }),
    )
    .max(BOT_REPLY_ASSISTANT_MAX_PROPOSALS)
    .default([]),
  note: z.string().nullable().default(null),
});

/** Tope de la nota al mostrarla; recortar es mejor que perderlo todo. */
export const BOT_REPLY_ASSISTANT_NOTE_MAX_LENGTH = 600;

export function sanitizeAssistantNote(note: string | null): string | null {
  if (!note) return null;
  const trimmed = note.trim();
  return trimmed ? trimmed.slice(0, BOT_REPLY_ASSISTANT_NOTE_MAX_LENGTH) : null;
}

export type BotReplyAssistantOutput = z.infer<
  typeof botReplyAssistantOutputSchema
>;
export type BotReplyProposal = BotReplyAssistantOutput["proposals"][number];

// --- Privacidad ------------------------------------------------------------

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const LONG_DIGITS_PATTERN = /\+?\d[\d\s().-]{6,}\d/g;

/**
 * Lo que sale del servidor va sin datos de contacto. El texto de la pregunta
 * es lo único que sirve para agrupar temas; un teléfono o un correo no aporta
 * nada al análisis y no tiene por qué viajar.
 */
export function redactCustomerText(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[correo]")
    .replace(LONG_DIGITS_PATTERN, "[número]")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Preparación de los mensajes ------------------------------------------

export interface AssistantMessage {
  body: string;
  createdAt: Date;
}

/**
 * Deja solo los mensajes que el bot habría dejado pasar. Los que ya activan
 * una respuesta están resueltos y solo ensuciarían el análisis.
 */
export function selectUnansweredMessages(
  messages: AssistantMessage[],
  activeReplies: WhatsAppBotKeyword[],
  limit = BOT_REPLY_ASSISTANT_MAX_MESSAGES,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const message of messages) {
    const body = redactCustomerText(message.body ?? "");
    if (body.length < 4) continue;
    if (matchWhatsAppKeyword(body, activeReplies)) continue;

    // Mensajes repetidos («hola») no valen tres veces en el análisis. La
    // clave ignora la puntuación: «Hacen envíos?» y «hacen envios» son la
    // misma pregunta y contarlas dos veces le daría un peso falso al tema.
    const key = normalizeBotText(body)
      .replace(/[^a-z0-9ñ ]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);

    result.push(body.slice(0, 200));
    if (result.length >= limit) break;
  }

  return result;
}

// --- Limpieza de las propuestas -------------------------------------------

export interface SanitizedProposal {
  label: string;
  triggers: string[];
  answer: string;
  reason: string;
  examples: string[];
  needsReview: boolean;
  /** Disparadores descartados porque otra respuesta ya se los queda. */
  droppedTriggers: string[];
}

/**
 * Ajusta lo que propuso el modelo a las reglas reales del bot.
 *
 * La importante: gana la primera respuesta que coincida. Un disparador que ya
 * esté cubierto por una respuesta activa —o por otra propuesta de esta misma
 * tanda— jamás se dispararía, así que se quita en vez de dejarlo engañando.
 * Se usa `matchWhatsAppKeyword`, el mismo emparejador de producción, para que
 * la comprobación no se desvíe de lo que hace el bot de verdad.
 */
export function sanitizeBotReplyProposals(
  output: BotReplyAssistantOutput,
  activeReplies: WhatsAppBotKeyword[],
): SanitizedProposal[] {
  const accepted: SanitizedProposal[] = [];
  // Empieza con lo que ya existe y va creciendo con cada propuesta aceptada.
  const taken: WhatsAppBotKeyword[] = [...activeReplies];

  for (const proposal of output.proposals) {
    const label = proposal.label.trim().slice(0, 80);
    const answer = stripBotMarker(proposal.answer)
      .trim()
      .slice(0, BOT_REPLY_ANSWER_MAX_LENGTH);
    if (!label || !answer) continue;

    const triggers: string[] = [];
    const droppedTriggers: string[] = [];

    for (const trigger of parseTriggerLines(proposal.triggers.join("\n"))) {
      if (trigger.length < BOT_REPLY_MIN_TRIGGER_LENGTH) {
        droppedTriggers.push(trigger);
        continue;
      }
      if (matchWhatsAppKeyword(trigger, taken)) {
        droppedTriggers.push(trigger);
        continue;
      }
      triggers.push(trigger);
      // Se reserva de inmediato: dos propuestas no pueden pedir lo mismo.
      taken.push({ label, triggers: [trigger], answer });
    }

    if (triggers.length === 0) continue;

    accepted.push({
      label,
      triggers,
      answer,
      reason: proposal.reason.trim().slice(0, 280),
      examples: proposal.examples
        .map((example) => example.trim().slice(0, 200))
        .filter(Boolean),
      needsReview: proposal.needsReview,
      droppedTriggers,
    });
  }

  return accepted;
}

/** El sistema ya pone la marca; que el modelo la repita la duplicaría. */
function stripBotMarker(answer: string): string {
  return answer.split(WHATSAPP_BOT_MARKER).join("").trimStart();
}

// --- Prompt ----------------------------------------------------------------

export function buildBotReplyAssistantPrompt(input: {
  mode: BotReplyAssistantRequest["mode"];
  topic?: string;
  storeName: string;
  existingLabels: string[];
  existingTriggers: string[];
  messages: string[];
}): string {
  const existing = input.existingTriggers.length
    ? input.existingTriggers.join(", ")
    : "(ninguna todavía)";

  const task =
    input.mode === "topic"
      ? `La dueña quiere una respuesta automática sobre esto, escrito con sus palabras:\n"""\n${input.topic}\n"""\nPropón UNA respuesta, o dos como mucho si el tema se parte en dos preguntas claramente distintas.`
      : `Abajo están los mensajes reales que llegaron y que el bot NO supo contestar. Agrupa los que preguntan lo mismo y propón hasta ${BOT_REPLY_ASSISTANT_MAX_PROPOSALS} respuestas, empezando por el tema que más se repite.\n\nMensajes:\n${input.messages.map((message) => `- ${message}`).join("\n")}`;

  return [
    `Ayudas a ${input.storeName}, una papelería colombiana que vende artículos kawaii, a configurar el bot de WhatsApp que contesta solo.`,
    "",
    "Cómo funciona el bot, y es la regla que manda:",
    "- Compara el mensaje de la clienta contra una lista de frases. Si alguna de esas frases aparece DENTRO del mensaje, contesta.",
    "- Gana la primera respuesta que coincida, así que dos respuestas no pueden pelear por la misma frase.",
    "- No entiende contexto ni recuerda la conversación: contesta una sola vez y ya.",
    "",
    "Reglas para las frases que activan (triggers):",
    "- En minúsculas y sin tildes.",
    "- Trozos cortos que aparezcan tal cual en un mensaje real: «horario», «a que hora», «hacen envios».",
    "- Cada frase tiene que sostenerse sola como algo que alguien escribiría. NO copies pedazos sueltos de un mensaje: «salir te la» o «manana si» son recortes, no frases, y harían que el bot conteste cuando no debe.",
    `- Mínimo ${BOT_REPLY_MIN_TRIGGER_LENGTH} caracteres. Nunca palabras sueltas y genéricas como «si», «ok» o «que».`,
    "- Entre 3 y 8 frases por respuesta, cubriendo las formas distintas de preguntar lo mismo.",
    `- Estas frases YA están tomadas por otras respuestas, no las repitas ni propongas frases que las contengan: ${existing}`,
    "",
    "Reglas para la respuesta:",
    "- Español de Colombia, tuteando, cálida y breve. Dos o tres frases.",
    "- Como la escribiría la dueña de una papelería pequeña, no un centro de llamadas.",
    "- Sin emojis al principio (el sistema ya pone una marca de mensaje automático).",
    `- Máximo ${BOT_REPLY_ANSWER_MAX_LENGTH} caracteres.`,
    "- NO inventes datos que no sabes: horarios, precios, plazos de envío, direcciones o cuentas bancarias. Si hacen falta, escríbelos entre corchetes como [tu horario] y marca needsReview en true.",
    "",
    `Respuestas que ya existen (no las repitas): ${input.existingLabels.join(", ") || "(ninguna)"}`,
    "",
    task,
    "",
    "En `reason` explica en una línea, para la dueña, por qué vale la pena esta respuesta.",
    "En `examples` copia hasta 3 mensajes reales de los de arriba que esta respuesta habría contestado (en modo tema, deja la lista vacía).",
    "Si no hay nada que valga la pena proponer, devuelve `proposals` vacío y explica por qué en `note`.",
  ].join("\n");
}

// --- Claves de Redis -------------------------------------------------------

export function getBotReplyAssistantRateLimitKey(storeId: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `bot-reply-assistant:rate:${storeId}:${day}`;
}

export function getBotReplyAssistantCacheKey(
  storeId: string,
  fingerprint: string,
): string {
  return `bot-reply-assistant:cache:${storeId}:${fingerprint}`;
}

// --- Entrega al formulario -------------------------------------------------

export interface BotReplyDraft {
  label: string;
  /** Una frase por línea, como las espera el formulario. */
  triggers: string;
  answer: string;
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/**
 * Una propuesta aceptada viaja al formulario por la URL. Se vuelve a limpiar
 * aquí, en el servidor, porque cualquiera puede escribir esos parámetros a
 * mano: lo que llega es una sugerencia, no algo en lo que se pueda confiar.
 */
export function parseBotReplyDraft(
  params: Record<string, string | string[] | undefined>,
): BotReplyDraft | null {
  const label = firstParam(params.label).trim().slice(0, 80);
  const answer = firstParam(params.answer)
    .trim()
    .slice(0, BOT_REPLY_ANSWER_MAX_LENGTH);
  const triggers = parseTriggerLines(firstParam(params.triggers)).join("\n");

  if (!label && !answer && !triggers) return null;
  return { label, triggers, answer };
}
