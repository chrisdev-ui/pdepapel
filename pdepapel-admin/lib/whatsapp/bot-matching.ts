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

/**
 * Parte el texto en palabras. Separa por todo lo que no sea letra ni número,
 * así que la puntuación y los emoji no pegan palabras entre sí.
 *
 * La clase va escrita a mano en vez de con `\p{L}` porque el `target` de este
 * proyecto no admite esa forma; da igual, porque aquí el texto ya pasó por
 * `normalizeBotText`, que quita las tildes y deja letras sin marcas.
 */
function tokenize(value: string): string[] {
  return value.split(/[^a-z0-9ñ]+/i).filter(Boolean);
}

/**
 * Aplana la vocal estirada del chat: «hoola», «holaaa» y «siii» son «hola» y
 * «si».
 *
 * Solo vocales. En español doblar una consonante cambia la palabra —«calle» no
 * es «cale», «carro» no es «caro»— y aplanarlas inventaría coincidencias.
 * Doblar una vocal, en cambio, casi nunca es ortografía: es alguien alargando
 * el saludo.
 */
function collapseStretchedVowels(word: string): string {
  return word.replace(/([aeiou])\1+/g, "$1");
}

function comparable(value: string): string[] {
  return tokenize(value).map(collapseStretchedVowels);
}

/** ¿Están estas palabras, seguidas y enteras, dentro de aquellas? */
function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    let todas = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        todas = false;
        break;
      }
    }
    if (todas) return true;
  }
  return false;
}

/**
 * Primera entrada cuyo disparador aparezca en el mensaje, **por palabras
 * enteras**; `null` si ninguna.
 *
 * Antes esto era un `includes` sobre la cadena entera, y en una papelería eso
 * es una trampa: el disparador «ola» del saludo vive dentro de «escolares» y
 * «oli» dentro de «bolígrafos», así que «¿tienen útiles escolares?» contestaba
 * «¡Hola! 💛 Qué gusto que escribas…» en vez de buscar el producto. El saludo
 * se prueba de último (`sortOrder` 100), pero igual gana al clasificador de
 * productos, que va después en `runWhatsAppBot`.
 *
 * Un disparador de varias palabras —«a que hora», «hoja oficio»— sigue valiendo:
 * tiene que aparecer seguido y entero.
 */
export function matchWhatsAppKeyword(
  body: string,
  keywords: WhatsAppBotKeyword[],
): { keyword: WhatsAppBotKeyword; trigger: string } | null {
  const palabras = comparable(normalizeBotText(body));
  if (palabras.length === 0) return null;

  for (const keyword of keywords) {
    for (const trigger of keyword.triggers) {
      const needle = normalizeBotText(trigger);
      if (!needle) continue;
      if (containsPhrase(palabras, comparable(needle))) {
        return { keyword, trigger: needle };
      }
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
