import { z } from "zod";

import prismadb from "@/lib/prismadb";
import { normalizeBotText, type WhatsAppBotKeyword } from "@/lib/whatsapp/bot-matching";

/**
 * Respuestas automáticas guardadas en la base de datos y editables desde el
 * panel. Sustituyen al arreglo que vivía en el código.
 *
 * Los disparadores se guardan ya normalizados (minúsculas, sin tildes) para
 * que lo que ella escriba en el formulario y lo que escriba una clienta se
 * comparen igual, sin que ella tenga que pensar en acentos ni mayúsculas.
 */

export const BOT_REPLY_MAX_TRIGGERS = 25;
export const BOT_REPLY_ANSWER_MAX_LENGTH = 1000;

/**
 * Meta admite 3 botones como máximo. El último siempre es «Hablar con Paula»,
 * así que a ella le quedan 2.
 */
export const BOT_REPLY_MAX_BUTTONS = 2;
/** Tope de Meta para el texto de un botón. */
export const BOT_REPLY_BUTTON_TITLE_MAX = 20;
/** Id del botón de escape. No apunta a ninguna respuesta: llama a Paula. */
export const TALK_TO_OWNER_BUTTON_ID = "owner";
export const TALK_TO_OWNER_BUTTON_TITLE = "Hablar con Paula";
/** Los botones que llevan a otra respuesta viajan como `r:<id>`. */
export const BUTTON_TARGET_PREFIX = "r:";
/** Las filas de producto de una lista viajan como `p:<id>`. */
export const PRODUCT_ROW_PREFIX = "p:";

export interface BotReplyButton {
  title: string;
  /** Respuesta que se manda cuando lo tocan. */
  targetReplyId: string;
}

export const botReplyButtonSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Ponle texto al botón")
    .max(BOT_REPLY_BUTTON_TITLE_MAX, `Máximo ${BOT_REPLY_BUTTON_TITLE_MAX} caracteres`),
  targetReplyId: z.string().trim().min(1, "Elige a qué respuesta lleva"),
});

/** Lee los botones guardados sin confiar en su forma. */
export function parseStoredButtons(value: unknown): BotReplyButton[] {
  if (!Array.isArray(value)) return [];
  const buttons: BotReplyButton[] = [];
  for (const item of value) {
    const parsed = botReplyButtonSchema.safeParse(item);
    if (parsed.success) buttons.push(parsed.data);
  }
  return buttons.slice(0, BOT_REPLY_MAX_BUTTONS);
}

/** `r:<id>` para los botones de menú; el de Paula viaja con su propio id. */
export function buildButtonId(targetReplyId: string): string {
  return `${BUTTON_TARGET_PREFIX}${targetReplyId}`;
}

/** Devuelve la respuesta a la que apunta un botón tocado, si apunta a alguna. */
export function readButtonTarget(buttonId: string | null | undefined): string | null {
  if (!buttonId || !buttonId.startsWith(BUTTON_TARGET_PREFIX)) return null;
  const target = buttonId.slice(BUTTON_TARGET_PREFIX.length).trim();
  return target || null;
}

/** `p:<id>` para las filas de producto de una lista. */
export function buildProductRowId(productId: string): string {
  return `${PRODUCT_ROW_PREFIX}${productId}`;
}

/** Devuelve el producto que señala una fila tocada, si señala alguno. */
export function readProductTarget(rowId: string | null | undefined): string | null {
  if (!rowId || !rowId.startsWith(PRODUCT_ROW_PREFIX)) return null;
  const target = rowId.slice(PRODUCT_ROW_PREFIX.length).trim();
  return target || null;
}

/**
 * Una respuesta CON botones es un menú, y un menú no sale hasta que Paula lo
 * apruebe. Sin botones no hace falta: ese texto lo escribió ella.
 */
export function isBotReplySendable(reply: {
  isActive: boolean;
  buttons?: unknown;
  approvedAt?: Date | null;
}): boolean {
  if (!reply.isActive) return false;
  if (parseStoredButtons(reply.buttons).length === 0) return true;
  return Boolean(reply.approvedAt);
}

/** Una frase por línea en el formulario; aquí se parte, limpia y deduplica. */
export function parseTriggerLines(raw: string): string[] {
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n|,/)) {
    const normalized = normalizeBotText(line);
    if (normalized) seen.add(normalized);
  }
  return Array.from(seen).slice(0, BOT_REPLY_MAX_TRIGGERS);
}

export function triggersToLines(triggers: string[]): string {
  return triggers.join("\n");
}

/** Lee los disparadores guardados sin confiar en su forma. */
export function parseStoredTriggers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

// --- Entrada de la API -----------------------------------------------------

export const botReplyInputSchema = z.object({
  label: z.string().trim().min(1, "Ponle un nombre").max(80, "El nombre es muy largo"),
  triggers: z
    .array(z.string().trim().min(1))
    .min(1, "Escribe al menos una frase que active la respuesta")
    .max(BOT_REPLY_MAX_TRIGGERS),
  answer: z
    .string()
    .trim()
    .min(1, "Escribe la respuesta")
    .max(BOT_REPLY_ANSWER_MAX_LENGTH, "La respuesta es muy larga para un mensaje de WhatsApp"),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  buttons: z.array(botReplyButtonSchema).max(BOT_REPLY_MAX_BUTTONS).default([]),
});

export type BotReplyInput = z.infer<typeof botReplyInputSchema>;

/** Normaliza los disparadores antes de guardar, venga de donde venga la entrada. */
export function parseBotReplyInput(body: unknown): BotReplyInput {
  const parsed = botReplyInputSchema.parse(body);
  const triggers = parseTriggerLines(parsed.triggers.join("\n"));
  if (triggers.length === 0) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["triggers"],
        message: "Escribe al menos una frase que active la respuesta",
      },
    ]);
  }
  return { ...parsed, triggers };
}

// --- Vistas ----------------------------------------------------------------

export interface BotReplyRow {
  id: string;
  label: string;
  triggers: string[];
  answer: string;
  isActive: boolean;
  sortOrder: number;
  buttons: BotReplyButton[];
  approvedAt: Date | null;
  approvedBy: string | null;
  updatedAt: Date;
}

// --- Lectura para el bot ---------------------------------------------------

/**
 * Respuestas activas de la tienda, en el orden en que se prueban. Si no hay
 * ninguna, el bot no contesta nada: es el estado con el que nace la tabla.
 */
export async function getActiveBotKeywords(storeId: string): Promise<WhatsAppBotKeyword[]> {
  const replies = await prismadb.whatsAppBotReply.findMany({
    where: { storeId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      label: true,
      triggers: true,
      answer: true,
      buttons: true,
      approvedAt: true,
      isActive: true,
    },
  });

  return replies
    .filter((reply) => isBotReplySendable(reply))
    .map((reply) => ({
      id: reply.id,
      label: reply.label,
      triggers: parseStoredTriggers(reply.triggers),
      answer: reply.answer,
      buttons: parseStoredButtons(reply.buttons),
    }))
    .filter((reply) => reply.triggers.length > 0);
}

/**
 * Una respuesta concreta para mandarla tras tocar un botón. No pasa por los
 * disparadores —el botón ya dijo cuál es— pero sí por la regla de aprobación.
 */
export async function getSendableBotReply(
  storeId: string,
  replyId: string,
): Promise<WhatsAppBotKeyword | null> {
  const reply = await prismadb.whatsAppBotReply.findFirst({
    where: { id: replyId, storeId },
    select: {
      id: true,
      label: true,
      answer: true,
      buttons: true,
      approvedAt: true,
      isActive: true,
    },
  });
  if (!reply || !isBotReplySendable(reply)) return null;

  return {
    id: reply.id,
    label: reply.label,
    // Se llega por botón, no por frase.
    triggers: [],
    answer: reply.answer,
    buttons: parseStoredButtons(reply.buttons),
  };
}
