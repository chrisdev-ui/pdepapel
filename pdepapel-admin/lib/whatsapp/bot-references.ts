import { ConversationMessageSentBy } from "@prisma/client";

import prismadb from "@/lib/prismadb";
import type { ProductIntent } from "@/lib/whatsapp/bot-products";

/**
 * «El primero», «ese», «el 2».
 *
 * Señalar sin nombrar es lo más natural del mundo después de una lista, y era
 * justo lo único que el bot no sabía hacer: no recuerda nada de un mensaje al
 * siguiente, así que «el primero» no tiene ni una palabra que buscar y acababa
 * en «Esa no me la sé».
 *
 * La memoria que hace falta es mínima: qué productos se acaban de enseñar. Eso
 * ya se puede guardar en `ConversationMessage.metadata`, que existe y hoy solo
 * se usa para los carritos que llegan del catálogo. Sin columna nueva.
 */

/** Diez minutos. Medido sobre 167 respuestas reales: el 86 % llega antes. */
export const REFERENCE_TTL_MS = 10 * 60 * 1000;

/** Lo que se guarda en el mensaje del bot para poder resolver la referencia. */
export interface ShownProducts {
  ids: string[];
  intent: ProductIntent;
}

export type ProductReference =
  /** «el primero», «el 2» — posición en la lista, empezando por 1. */
  | { kind: "ordinal"; position: number }
  /** «el último». */
  | { kind: "last" }
  /** «ese», «esa» — solo vale si se enseñó UNO. */
  | { kind: "demonstrative" }
  /**
   * «los acrílicos», «la caja», «el x8»: nombra en vez de señalar. `tokens`
   * son las palabras que quedaron después de quitar artículos y cortesía —
   * se resuelven después, contra lo que de verdad se enseñó, porque aquí
   * todavía no se sabe si hay lista ni qué dice.
   */
  | { kind: "named"; tokens: string[] };

const normalizar = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const ORDINALES: Record<string, number> = {
  primero: 1, primera: 1, "1ro": 1, "1er": 1, "1ra": 1,
  segundo: 2, segunda: 2, "2do": 2, "2da": 2,
  tercero: 3, tercera: 3, "3ro": 3, "3er": 3, "3ra": 3,
  cuarto: 4, cuarta: 4, quinto: 5, quinta: 5,
};

const DEMOSTRATIVOS = new Set(["ese", "esa", "eso", "esos", "esas"]);

/** Lo que puede ir detrás del número sin dejar de señalar: pura cortesía. */
const CIERRES = new Set([
  "porfa", "porfavor", "por", "favor", "gracias", "please", "pls", "ps",
  "entonces", "ese", "esa", "eso", "plis",
]);

/**
 * Lo que se cae al nombrar un producto. A propósito NO están los verbos de
 * pedir —«quiero», «dame»—: sin ellos una frase de verdad deja demasiadas
 * palabras, se pasa del tope de tres y sigue su camino hacia el clasificador,
 * que es justo lo que tiene que pasar.
 */
const REFERENCE_STOP_WORDS = new Set([
  "el", "la", "los", "las", "un", "una", "unos", "unas",
  "de", "del", "al", "y", "o", "que", "con", "para",
  // `Array.from` y no un spread: el target de TS de este proyecto no itera Sets.
  ...Array.from(CIERRES),
]);

function referenceTokens(texto: string): string[] {
  return texto.split(" ").filter((p) => p.length >= 2 && !REFERENCE_STOP_WORDS.has(p));
}

/**
 * Qué señaló, si es que señaló algo. `null` = no es una referencia y el
 * mensaje sigue su camino normal.
 */
export function detectProductReference(body: string): ProductReference | null {
  const texto = normalizar(body);
  if (!texto) return null;
  const palabras = texto.split(" ");

  if (palabras.some((p) => p === "ultimo" || p === "ultima")) return { kind: "last" };

  for (const palabra of palabras) {
    const pos = ORDINALES[palabra];
    if (pos) return { kind: "ordinal", position: pos };
  }

  // «el 2», «numero 2», «dame el 3» y el número suelto. Lo que separa señalar
  // de contar es lo que va DESPUÉS: en «quiero 2 cuadernos» el número dice
  // cuántos, no cuál. Así que solo cuenta si cierra la frase.
  const indice = palabras.findIndex((p) => /^\d{1,2}$/.test(p));
  if (indice >= 0 && palabras.slice(indice + 1).every((p) => CIERRES.has(p))) {
    const pos = Number(palabras[indice]);
    if (pos >= 1 && pos <= 20) return { kind: "ordinal", position: pos };
  }

  if (palabras.some((p) => DEMOSTRATIVOS.has(p))) return { kind: "demonstrative" };

  // Nombrar en vez de señalar: «los acrílicos». Como mucho tres palabras, que
  // es lo que mide una respuesta corta a una lista; de ahí para arriba ya es
  // una frase y la contesta el clasificador, no esto.
  const tokens = referenceTokens(texto);
  if (tokens.length > 0 && tokens.length <= 3) return { kind: "named", tokens };

  return null;
}

export type ReferenceResolution =
  /** Se supo cuál: se contesta de ese producto. */
  | { outcome: "resolved"; productId: string; intent: ProductIntent }
  /** Había lista, pero ya no vale: pasó el rato, o ese número no existía. */
  | { outcome: "lost" }
  /** Nada a lo que señalar, o «ese» con varios: el mensaje sigue su camino. */
  | { outcome: "none" };

function normalizarNombre(nombre: string): string {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Deliberadamente simple: esto solo corre contra el puñado de productos que
 * se acaban de enseñar, nunca contra el catálogo, así que no hace falta nada
 * más listo que pedir que todas las palabras estén en el nombre.
 */
function encajaEnNombre(tokens: string[], nombre: string): boolean {
  if (tokens.length === 0) return false;
  const objetivo = normalizarNombre(nombre);
  return tokens.every((t) => objetivo.includes(t));
}

/** Lee lo guardado en un mensaje del bot, si trae algo utilizable. */
export function parseShownProducts(metadata: unknown): ShownProducts | null {
  const shown = (metadata as { shown?: unknown } | null)?.shown;
  if (!shown || typeof shown !== "object") return null;
  const { ids, intent } = shown as { ids?: unknown; intent?: unknown };
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const limpios = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!limpios.length || typeof intent !== "string") return null;
  return { ids: limpios, intent: intent as ProductIntent };
}

/**
 * De «el primero» al producto concreto.
 *
 * Se guarda el id, nunca el precio ni las existencias: al resolver se vuelve a
 * consultar el producto, para que lo que se conteste sea lo de ahora y no lo
 * de hace diez minutos.
 */
export async function resolveProductReference(input: {
  conversationId: string;
  storeId: string;
  reference: ProductReference;
  now?: Date;
}): Promise<ReferenceResolution> {
  // Los últimos mensajes del bot: el más reciente que traiga lista es el que
  // la clienta tiene delante. Se miran varios porque entre medias puede haber
  // salido un acuse o una respuesta de otro tipo, que no llevan lista. Y se
  // miran SIN filtrar por fecha a propósito: hace falta distinguir una lista
  // caducada —ahí sí se admite el despiste— de no haber enseñado ninguna, que
  // es un «2» que significa otra cosa y no hay que contestar.
  const recientes = await prismadb.conversationMessage.findMany({
    where: {
      conversationId: input.conversationId,
      sentBy: ConversationMessageSentBy.BOT,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true, createdAt: true },
    take: 5,
  });

  let shown: ShownProducts | null = null;
  let mostradaEn: Date | null = null;
  for (const mensaje of recientes) {
    shown = parseShownProducts(mensaje.metadata);
    if (shown) {
      mostradaEn = mensaje.createdAt;
      break;
    }
  }
  if (!shown || !mostradaEn) return { outcome: "none" };

  // Regla deliberada: «ese» solo vale si no hay entre qué elegir. Con varios
  // no se adivina —y tampoco se dice que se perdió el hilo, porque no se
  // perdió: el mensaje sigue su camino como si esto no existiera.
  if (input.reference.kind === "demonstrative" && shown.ids.length !== 1) {
    return { outcome: "none" };
  }

  const now = input.now ?? new Date();
  const vencida = now.getTime() - mostradaEn.getTime() > REFERENCE_TTL_MS;

  // Aquí el orden importa, y es al revés que en todo lo demás.
  //
  // Un ordinal o un «ese» ya dicen por sí solos que se habla de la lista, así
  // que si pasó el rato se admite el despiste. Nombrar no dice nada: la
  // mayoría de los mensajes de una o dos palabras no van de la lista. Así que
  // primero se mira si encaja con UNO, y solo entonces se mira el reloj; si no
  // encaja con nada, el mensaje sigue su camino como si esto no existiera, en
  // vez de contestarle «se me fue el hilo» a un «vale gracias».
  if (input.reference.kind === "named") {
    const { tokens } = input.reference;
    const candidatos = await prismadb.product.findMany({
      where: { id: { in: shown.ids }, storeId: input.storeId, isArchived: false },
      select: { id: true, name: true },
    });
    const encajan = candidatos.filter((p) => encajaEnNombre(tokens, p.name));
    // Ni con ninguno ni con varios se adivina: misma regla que «ese».
    if (encajan.length !== 1) return { outcome: "none" };
    if (vencida) return { outcome: "lost" };
    return { outcome: "resolved", productId: encajan[0].id, intent: shown.intent };
  }

  if (vencida) return { outcome: "lost" };

  const productId =
    input.reference.kind === "last"
      ? shown.ids[shown.ids.length - 1]
      : input.reference.kind === "demonstrative"
        ? shown.ids[0]
        : shown.ids[input.reference.position - 1];
  // Pidió «el cuarto» de una lista de dos.
  if (!productId) return { outcome: "lost" };

  // El producto puede haberse archivado desde que se enseñó.
  const existe = await prismadb.product.findFirst({
    where: { id: productId, storeId: input.storeId, isArchived: false },
    select: { id: true },
  });
  if (!existe) return { outcome: "lost" };

  return { outcome: "resolved", productId, intent: shown.intent };
}

/**
 * Con qué pregunta se enseñó este producto.
 *
 * Una fila tocada solo lleva el producto, no lo que se preguntó, y no es lo
 * mismo contestar «cómo es» que «cuánto vale». La intención ya quedó guardada
 * con la lista, así que se lee de ahí. Sin plazo a propósito: una fila se
 * puede tocar días después y el id sigue siendo bueno.
 *
 * Si no se encuentra nada se contesta como una búsqueda, que es la respuesta
 * que sirve para cualquier pregunta: nombre, precio y si se lo aparta.
 */
export async function readShownIntentForProduct(
  conversationId: string,
  productId: string,
): Promise<ProductIntent> {
  const recientes = await prismadb.conversationMessage.findMany({
    where: {
      conversationId,
      sentBy: ConversationMessageSentBy.BOT,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
    take: 5,
  });
  for (const mensaje of recientes) {
    const shown = parseShownProducts(mensaje.metadata);
    if (shown?.ids.includes(productId)) return shown.intent;
  }
  return "product.search";
}
