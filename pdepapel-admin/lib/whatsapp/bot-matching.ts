/**
 * Emparejado de palabras clave del bot de WhatsApp.
 *
 * Puro y sin dependencias del servidor a propósito: el panel lo usa para
 * mostrarle a la dueña qué respuesta saldría con una frase de prueba, sin
 * llamar a la API ni tocar la base de datos.
 */

/**
 * Texto que encabezaba toda respuesta automática («🤖 Respuesta automática»).
 * Se quitó el 2026-09-14 por decisión de Paula: quiere que la conversación se
 * sienta como hablar con ella, no con una máquina.
 *
 * Se conserva vacío a propósito, no se borra: `stripLegacyBotMarker` lo usa
 * para limpiar un encabezado que el asistente haya copiado de un ejemplo viejo.
 *
 * Ojo, que no se pierda el hilo: en el PANEL las respuestas del bot se siguen
 * distinguiendo. Van guardadas con `sentBy: BOT` y se pintan aparte en la
 * conversación. Lo que cambia es lo que ve la clienta, no lo que ve Paula.
 */
export const LEGACY_WHATSAPP_BOT_MARKER = "🤖 Respuesta automática";

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

/**
 * La respuesta sale tal como Paula la escribió, sin encabezado.
 *
 * Si el texto trae por error el encabezado viejo, se quita: una respuesta
 * guardada antes del cambio no debe salir con él.
 */
export function formatBotReply(answer: string): string {
  return stripLegacyBotMarker(answer).trim();
}

export function stripLegacyBotMarker(value: string): string {
  return value.split(LEGACY_WHATSAPP_BOT_MARKER).join("").trimStart();
}
