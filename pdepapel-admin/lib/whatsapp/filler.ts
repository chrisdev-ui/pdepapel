import { normalizeBotText } from "@/lib/whatsapp/bot-matching";

/**
 * «ok», «gracias», «listo»: cierres que no piden nada. Módulo puro (sin
 * Prisma): lo leen el bot, el modo ráfaga y el aviso de «Esperando a Paula».
 */
const FILLER_PHRASE =
  "(?:gracias|muchas gracias|mil gracias|ok|okey|okay|vale|listo|dale|bueno|perfecto|super|genial|si|bien|claro|ah ok|ya|es para mi \\w+|es para un regalo|es un regalo|porfa|por favor|quedo atenta|quedo atento|por la info|por la informacion|por todo)";
/** Uno o varios cierres seguidos: «ok», «ok gracias», «listo, mil gracias». */
const FILLER = new RegExp(`^${FILLER_PHRASE}(?: ${FILLER_PHRASE})*$`);

/** El texto sin tildes, signos ni emoji, en minúsculas. */
export const plainBotText = (text: string) =>
  normalizeBotText(text).replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();

/** Vacío (solo emoji o signos) o un cierre de cortesía. */
export function isFillerText(text: string | null | undefined): boolean {
  const plain = plainBotText(text ?? "");
  return !plain || FILLER.test(plain);
}
