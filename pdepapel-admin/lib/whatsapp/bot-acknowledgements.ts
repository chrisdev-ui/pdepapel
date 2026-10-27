/**
 * Los acuses con los que el bot le dice a la clienta que Paula escribe. Módulo
 * puro (sin Prisma ni envíos): los leen el bot y «Esperando a Paula», que no
 * puede arrastrar todo el bot. `bot.ts` los vuelve a exportar.
 */

/** Lo que se contesta al tocar «Hablar con Paula». */
export const TALK_TO_OWNER_ACKNOWLEDGEMENT =
  "Listo, le aviso a Paula. Ella te escribe apenas pueda 💛";

/**
 * Lo que se contesta cuando el bot no sabe.
 *
 * Antes no se contestaba nada: la conversación pasaba a NEEDS_OWNER y la
 * clienta se quedaba mirando el chat sin saber si su mensaje llegó. Con cero
 * respuestas configuradas ese era el caso de SIEMPRE.
 */
export const NO_MATCH_ACKNOWLEDGEMENT =
  "Esa no me la sé 💛 Le paso tu mensaje a Paula y ella te escribe apenas pueda.";

/** «Lo que me enviaste» y no «tu foto»: por aquí pasan audios y documentos. */
export const UNREADABLE_MEDIA_ACKNOWLEDGEMENT =
  "Recibí lo que me enviaste 💛 Se lo paso a Paula y ella te escribe apenas pueda.";

/** Cuando el botón apunta a una respuesta que ya no está disponible. */
export const UNAVAILABLE_OPTION_ACKNOWLEDGEMENT =
  "Esa opción ya no está disponible 💛 Le aviso a Paula para que te ayude.";

/** Va delante de la respuesta de productos cuando la pregunta llegó con un saludo («Hola, ¿tienen…?»). */
export const GREETING_REPLY_PREFIX = "¡Hola!";

