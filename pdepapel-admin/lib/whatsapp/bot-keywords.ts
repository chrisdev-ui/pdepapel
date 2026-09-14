/**
 * Tabla de respuestas automáticas de WhatsApp.
 *
 * Este archivo es SOLO datos: la lógica que decide cuándo contestar vive en
 * `lib/whatsapp/bot.ts` y no hay que tocarla para cambiar las respuestas.
 *
 * Cómo editarla:
 * - Cada entrada agrupa varias formas de preguntar lo mismo en `triggers` y
 *   una sola respuesta en `answer`.
 * - Los `triggers` se escriben YA NORMALIZADOS: minúsculas y sin tildes
 *   («a que hora», no «¿A qué hora?»). El bot normaliza el mensaje de la
 *   clienta de la misma forma antes de comparar.
 * - Gana la PRIMERA entrada que coincida, así que las más específicas van
 *   arriba.
 * - La respuesta se manda tal cual, con la marca de «respuesta automática»
 *   que agrega el bot. No hace falta escribirla aquí.
 * - Si ningún trigger coincide, el bot NO contesta: deja la conversación
 *   marcada para que la atienda una persona.
 */
export interface WhatsAppBotKeyword {
  /** Frases o palabras que llevan a la misma respuesta, en minúsculas y sin tildes. */
  triggers: string[];
  answer: string;
}

/**
 * Vacío a propósito. Mientras no haya entradas, el bot no contesta nada y deja
 * cada conversación marcada para que la atienda una persona, que es justo lo
 * que debe pasar hasta que Paula defina las respuestas reales. Una respuesta
 * de ejemplo aquí le llegaría tal cual a una clienta.
 *
 * Para activarlo, agregar entradas con esta forma:
 *
 *   {
 *     triggers: ["horario", "horarios", "a que hora"],
 *     answer: "Atendemos de lunes a sábado, de 9 a. m. a 6 p. m.",
 *   },
 */
export const WHATSAPP_BOT_KEYWORDS: WhatsAppBotKeyword[] = [
  {
    // TEMPORAL: solo para probar el envío saliente por Chakra de punta a punta.
    // Quitar esta entrada (volver el arreglo a `[]`) en cuanto se confirme el envío.
    triggers: ["prueba-webhook"],
    answer: "Recibido. Esta es una respuesta de prueba del bot (canal WhatsApp vía Chakra).",
  },
];
