/**
 * Emparejado de palabras clave del bot de WhatsApp.
 *
 * Puro y sin dependencias del servidor a propósito: el panel lo usa para
 * mostrarle a la dueña qué respuesta saldría con una frase de prueba, sin
 * llamar a la API ni tocar la base de datos.
 */

/** Marca visible que encabeza toda respuesta automática. */
export const WHATSAPP_BOT_MARKER = "🤖 Respuesta automática";

export interface WhatsAppBotKeyword {
  /** Frases que llevan a la misma respuesta, en minúsculas y sin tildes. */
  triggers: string[];
  answer: string;
  /** Nombre con el que la dueña la reconoce; opcional para el bot. */
  label?: string;
  /** Id de la respuesta guardada; hace falta para armar los botones. */
  id?: string;
  /** Botones que acompañan la respuesta, sin contar el de «Hablar con Paula». */
  buttons?: { title: string; targetReplyId: string }[];
}

/**
 * Minúsculas y sin tildes, con el mismo patrón que usa `lib/slugify.ts`, para
 * que «¿A QUÉ HORA?» y «a que hora» comparen igual.
 */
export function normalizeBotText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Primera entrada cuyo trigger aparezca en el mensaje; `null` si ninguna. */
export function matchWhatsAppKeyword(
  body: string,
  keywords: WhatsAppBotKeyword[],
): { keyword: WhatsAppBotKeyword; trigger: string } | null {
  const normalized = normalizeBotText(body);
  if (!normalized) return null;

  for (const keyword of keywords) {
    for (const trigger of keyword.triggers) {
      const needle = normalizeBotText(trigger);
      if (needle && normalized.includes(needle)) return { keyword, trigger: needle };
    }
  }
  return null;
}

/** Encabeza la respuesta con la marca, para que nunca se lea como una persona. */
export function formatBotReply(answer: string): string {
  return `${WHATSAPP_BOT_MARKER}\n\n${answer}`;
}
