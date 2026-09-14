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
    select: { label: true, triggers: true, answer: true },
  });

  return replies
    .map((reply) => ({
      label: reply.label,
      triggers: parseStoredTriggers(reply.triggers),
      answer: reply.answer,
    }))
    .filter((reply) => reply.triggers.length > 0);
}
