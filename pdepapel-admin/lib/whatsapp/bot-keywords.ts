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

// EJEMPLO — reemplazar con las respuestas reales que defina Paula.
export const WHATSAPP_BOT_KEYWORDS: WhatsAppBotKeyword[] = [
  {
    triggers: ["horario", "horarios", "a que hora", "que horario"],
    answer: "Placeholder — reemplazar con el horario real.",
  },
];
