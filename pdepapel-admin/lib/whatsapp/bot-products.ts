import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Output, generateText } from "ai";
import { createHash } from "node:crypto";
import { z } from "zod";

import { env } from "@/lib/env.mjs";
import prismadb from "@/lib/prismadb";
import { getCloudinaryImageUrl } from "@/lib/cloudinary-image-loader";
import {
  productNameTokenSearchWhere,
  productTokenSearchWhere,
  searchTokens,
} from "@/lib/search-terms";
import { type FactValue } from "@/lib/whatsapp/bot-facts";
import {
  TALK_TO_OWNER_BUTTON_ID,
  TALK_TO_OWNER_BUTTON_TITLE,
  buildProductRowId,
} from "@/lib/whatsapp/bot-replies";
import {
  WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
  WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH,
  type WhatsAppListRow,
} from "@/lib/whatsapp/send";

/**
 * Preguntas sobre productos por WhatsApp: si tienen algo y si queda.
 *
 * Tres piezas separadas a propósito:
 *  1. el modelo SOLO dice de qué va la pregunta y qué se busca;
 *  2. la consulta la arma este archivo contra la base de datos;
 *  3. la respuesta sale de una plantilla con esos datos.
 *
 * El modelo nunca ve un producto, ni un precio, ni —sobre todo— una cantidad
 * de existencias, porque cuando se le pregunta todavía no se ha consultado
 * nada. Y no puede redactar: lo que devuelve es un enum y dos palabras.
 *
 * Si el modelo se cae, se pasa de tiempo, se queda sin cuota o contesta algo
 * que no cuadra con el esquema, aquí no se contesta nada y el mensaje sigue su
 * camino: palabras clave y, si tampoco, a Paula. Callar no es una opción.
 */

/** Medido: el modelo tarda de 8 a 30 s. El techo son los ~25 s que Meta
 * mantiene el «escribiendo…», y hay que caber dentro con la respuesta. */
export const PRODUCT_CLASSIFIER_TIMEOUT_MS = 20000;

/** A partir de aquí la espera se nota y se avisa. */
export const PRODUCT_CLASSIFIER_SLOW_NOTICE_MS = 3500;

/** Una sola palabra —«útiles», «papel»— describe un estante entero. */
export const MIN_SEARCH_TOKENS = 2;
/** Meta admite diez filas; la décima es la de Paula. */
export const PRODUCT_MATCH_LIMIT = 9;

export type ProductIntent =
  | "product.search"
  | "product.availability"
  | "product.price"
  | "product.features"
  | "product.photo";

/** Descripción más corta que esto no da para una respuesta: se pasa a Paula. */
export const MIN_USEFUL_DESCRIPTION_LENGTH = 40;

// --- 1. Preguntarle al modelo de qué va -----------------------------------

/**
 * Dos ranuras separadas, no una frase.
 *
 * Es la raíz del problema que se midió: con «cuaderno de Stitch» como una
 * sola cadena, la búsqueda daba cero. Separado en tipo y personaje, cada
 * palabra se busca por su cuenta y aparecen los seis que sí hay.
 */
export const productClassificationSchema = z.object({
  intent: z.enum([
    "product.search",
    "product.availability",
    "product.price",
    "product.features",
    "product.photo",
    "other",
  ]),
  // `nullish` y no `nullable`: si el modelo se deja una ranura sin poner, se
  // trata como vacía en vez de tirar una clasificación que por lo demás era
  // buena. Perder un matiz es mucho mejor que perder la respuesta entera.
  productType: z.string().trim().max(40).nullish().transform((v) => v ?? null),
  character: z.string().trim().max(40).nullish().transform((v) => v ?? null),
  /**
   * Lo que distingue a un producto de otro igual: color, tamaño, material,
   * estampado. Sin esta ranura, «muéstrame el morado pastel» se quedaba sin
   * NADA que buscar —ni tipo ni personaje— y la compra moría ahí, aunque
   * «morado pastel» encuentre ese cuaderno y solo ese.
   */
  descriptor: z.string().trim().max(40).nullish().transform((v) => v ?? null),
});

export type ProductClassification = z.infer<typeof productClassificationSchema>;

export const PRODUCT_CLASSIFIER_PROMPT_VERSION = "productos-v1";

export const PRODUCT_CLASSIFIER_SYSTEM = `Clasificas mensajes de WhatsApp de una papelería colombiana (artículos kawaii, Sanrio, anime).
Tu única tarea es decir de qué va el mensaje y qué se busca. NUNCA redactes una respuesta para la clienta.

intent:
- "product.search": pregunta si tienen algo ("¿tienen algo de Kuromi?", "manejan stickers?")
- "product.availability": pregunta si queda o está disponible ("¿queda la cartuchera de capibara?")
- "product.price": pregunta cuánto cuesta ("¿cuánto vale el cuaderno de Stitch?")
- "product.features": pregunta cómo es el producto: material, tamaño, qué trae, cuántas hojas
- "product.photo": pide ver el producto ("mándame una foto del cuaderno", "cómo se ve?")
- "other": cualquier otra cosa, incluido saludar, dar las gracias, envíos, horarios o quejas.

productType: el tipo de artículo en singular (cuaderno, agenda, llavero, sticker...), o null si no lo dice.
character: el personaje, marca o franquicia (Stitch, Hello Kitty, Sanrio...), o null si no lo dice.
descriptor: lo que distingue ese producto de otro igual —color, tamaño, material, estampado—
  tal como lo dijo la clienta y con todas sus palabras ("morado pastel", "grande", "de tela",
  "de rayas"). null si no lo dice. Importante: si menciona un color o un tamaño, va SIEMPRE aquí,
  aunque no diga de qué artículo habla.

Si dudas, responde "other".`;

/** Qué pasó al clasificar; el motivo importa para saber por qué no se contestó. */
export type ClassifyOutcome =
  | { ok: true; value: ProductClassification }
  | { ok: false; reason: "not_configured" | "timeout" | "quota" | "invalid" | "error" };

/** La cuota agotada es un caso normal aquí, no una avería: se mira aparte. */
function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /quota|rate.?limit|RESOURCE_EXHAUSTED|429/i.test(message);
}

function isAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /abort|timeout|timed out/i.test(message);
}

export async function classifyProductQuestion(
  body: string,
): Promise<ClassifyOutcome> {
  if (!env.GEMINI_API_KEY) return { ok: false, reason: "not_configured" };

  try {
    const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY });
    const result = await generateText({
      model: google("gemini-3.5-flash-lite"),
      output: Output.object({ schema: productClassificationSchema }),
      system: PRODUCT_CLASSIFIER_SYSTEM,
      prompt: body,
      // Reintentar dentro de dos segundos y medio no sirve, y con la cuota
      // apretada cada intento cuenta: se prueba una vez y si no, se sigue.
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(PRODUCT_CLASSIFIER_TIMEOUT_MS),
    });

    const parsed = productClassificationSchema.safeParse(result.output);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    return { ok: true, value: parsed.data };
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, reason: "quota" };
    if (isAbortError(error)) return { ok: false, reason: "timeout" };
    return { ok: false, reason: "error" };
  }
}

/**
 * ¿Vale la pena preguntarle al modelo?
 *
 * La llave de Gemini es gratuita, la comparten tres pantallas del panel y se
 * queda sin cuota en cuanto llegan varios mensajes seguidos (medido: 8 de 40
 * llamadas seguidas fallaron). Un «gracias!!» no debería gastar una de esas.
 *
 * Deliberadamente generosa: ante la duda deja pasar y que decida el modelo.
 * Quedarse corta no rompe nada —el mensaje sigue a las palabras clave y de
 * ahí a Paula— pero pasarse gasta cuota que le hace falta a quien sí pregunta.
 */
const PRODUCT_SIGNALS = [
  // Si hay / si queda.
  "tiene", "tienen", "tienes", "maneja", "manejan", "hay ", "queda", "quedan",
  "disponible", "busco", "buscaba", "necesito", "quiero", "vende", "venden",
  "consigo", "algo de", "algun", "alguna", "cuentan con", "les queda",
  // Cuánto vale.
  "cuanto", "precio", "vale", "cuesta", "valen", "cuestan",
  // Cómo es.
  "material", "tamano", "medida", "que trae", "que incluye", "de que esta",
  "cuantas hojas", "cuantos", "como es", "caracteristica",
  // Enséñamelo.
  "foto", "fotos", "imagen", "imagenes", "como se ve", "ver el", "ver la",
  // El plural no estaba y «¿puedo ver los acrílicos?» se caía aquí, antes de
  // llegar a nada: el portero solo conocía «ver el» y «ver la».
  "ver los", "ver las", "dejas ver", "dejame ver", "puedo ver",
  "muestrame", "mandame", "manda una", "enviame",
];

export function looksLikeProductQuestion(body: string): boolean {
  const text = body
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return PRODUCT_SIGNALS.some((signal) => matchesSignal(text, signal));
}

/**
 * Por palabras enteras, no por trozos.
 *
 * Buscar «como es» dentro del texto tal cual encontraba «como estas», y un
 * «hola vecina como estas» acababa en el buscador de productos. Pasaba con
 * tres saludos de conversaciones reales. Exigir que la señal termine donde
 * termina una palabra lo arregla sin tocar la lista.
 */
function matchesSignal(text: string, signal: string): boolean {
  const i = text.indexOf(signal);
  if (i === -1) return false;
  // Algunas señales ya traen su propio final, como «hay »: ahí no hay nada
  // que comprobar, el espacio ya hizo de frontera.
  if (!/[a-z0-9]$/.test(signal)) return true;
  const siguiente = text[i + signal.length];
  return siguiente === undefined || !/[a-z0-9]/.test(siguiente);
}

// --- 2. Buscar de verdad ---------------------------------------------------

export interface ProductMatch {
  name: string;
  price: number;
}

export interface AvailabilityMatch {
  name: string;
  inStock: boolean;
}

export interface SearchResult<T> {
  matches: T[];
  total: number;
  hasMore: boolean;
  /**
   * Los ids de `matches`, en el mismo orden. Se guardan con el mensaje para
   * poder resolver luego un «el primero». Nunca se enseñan.
   */
  ids?: string[];
  /**
   * La foto, solo cuando hay UN único producto: con una lista no se puede
   * elegir cuál enseñar, y tres fotos seguidas serían un muro.
   */
  photo?: string | null;
}

/** Lo que se busca, armado con lo que dijo el modelo. */
export function buildSearchQuery(c: ProductClassification): string {
  return [c.productType, c.character, c.descriptor]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Cuando el modelo no supo separar nada, se busca el mensaje tal cual.
 *
 * Es la red por debajo de las tres ranuras: aunque no encajen —hoy el color
 * encaja, mañana será otra cosa—, las palabras de la clienta siguen ahí. Se
 * quitan las de cortesía y las de unión (`searchTokens`) y se busca con lo que
 * queda: de «muéstrame el morado pastel» sobra «morado pastel», que encuentra
 * ese cuaderno y solo ese.
 *
 * Devuelve cadena vacía cuando no queda nada útil, y entonces sí se escala.
 */
export function fallbackQueryFromMessage(body: string): string {
  return searchTokens(body).join(" ");
}

/**
 * `select` cerrado a propósito. `stock` entra aquí y no sale: lo que se
 * devuelve es un booleano. Ninguna plantilla, ni quien llame, ve el número.
 */
const MATCH_SELECT = {
  id: true,
  name: true,
  price: true,
  stock: true,
} as const;

/**
 * Primero por nombre; a la descripción solo si el nombre no da nada.
 *
 * Mirar también las descripciones ensucia la lista: un color mencionado de
 * pasada en otro producto lo cuela. Medido contra el catálogo real,
 * «borrador morado» pasaba de 6 productos a 1, y «cuaderno azul pastel» de 12
 * a 3, sin perder ninguno de los buenos.
 *
 * Pero a veces la palabra SOLO vive en la descripción —«agenda grande» no
 * encuentra nada por nombre y sí dos por descripción—, así que ahí se amplía.
 * El orden importa: ampliar solo puede añadir productos, nunca quitarlos, así
 * que se hace cuando falta algo, no cuando sobra.
 */
async function runSearch(
  storeId: string,
  query: string,
  options: { withDescription?: boolean } = {},
) {
  const porNombre = productNameTokenSearchWhere(query);
  if (porNombre.length === 0) return null;

  const primera = await buscarCon(storeId, porNombre, options);
  if (primera.total > 0) return primera;

  // El nombre no encontró nada: puede que la palabra esté en la descripción.
  return buscarCon(storeId, productTokenSearchWhere(query), options);
}

async function buscarCon(
  storeId: string,
  tokens: ReturnType<typeof productTokenSearchWhere>,
  options: { withDescription?: boolean },
) {
  const where = { storeId, isArchived: false, AND: tokens };
  const [rows, total] = (await Promise.all([
    prismadb.product.findMany({
      where,
      // `description` solo se pide cuando preguntan cómo es el producto. La
      // foto se pide SIEMPRE: cualquier respuesta de un solo producto la lleva.
      select: {
        ...MATCH_SELECT,
        ...(options.withDescription ? { description: true } : {}),
        images: {
          // La marcada como principal manda; las rotas (las marca el cron
          // diario) ni se miran. Es el mismo criterio que usa la tienda.
          where: { brokenAt: null },
          orderBy: { isMain: "desc" as const },
          select: { url: true },
          take: 1,
        },
      },
      // El buscador de la tienda ordena por relevancia calculada en SQL, que
      // aquí no aplica. Lo más vendido primero es lo que más suele servir.
      orderBy: [{ soldCount: "desc" }, { createdAt: "desc" }],
      take: PRODUCT_MATCH_LIMIT,
    }),
    prismadb.product.count({ where }),
  ])) as [
    {
      id: string;
      name: string;
      price: number;
      stock: number;
      description?: string | null;
      images: { url: string }[];
    }[],
    number,
  ];
  return { rows, total };
}

/** El ancho que ya usan la tienda y el panel; pedir otro crearía copias nuevas. */
export const PHOTO_WIDTH = 1600;

/**
 * La foto que se manda de un producto, ya lista para WhatsApp.
 *
 * `null` no es un fallo: son los ~9 productos de 845 sin ninguna utilizable
 * (todas rotas, o solo webp). La respuesta sale igual, sin foto.
 *
 * Pasa por la transformación de siempre, que además de no crear copias nuevas
 * en Cloudinary devuelve JPEG, lo único —con PNG— que Meta acepta.
 */
export function pickPhoto(images: { url: string }[] | undefined): string | null {
  const url = images?.[0]?.url;
  if (!url) return null;
  const listo = getCloudinaryImageUrl(url, PHOTO_WIDTH);
  return listo.trim() ? listo : null;
}

export async function resolveProductSearch(
  storeId: string,
  classification: ProductClassification,
): Promise<FactValue<SearchResult<ProductMatch>>> {
  const found = await runSearch(storeId, buildSearchQuery(classification));
  // Sin nada que buscar no se sabe. Cero resultados SÍ se sabe: es «no lo tengo».
  if (!found) return { known: false };
  return {
    known: true,
    value: {
      matches: found.rows.map((p) => ({ name: p.name, price: p.price })),
      ids: found.rows.map((p) => p.id),
      total: found.total,
      hasMore: found.total > PRODUCT_MATCH_LIMIT,
      photo: found.total === 1 ? pickPhoto(found.rows[0]?.images) : null,
    },
  };
}

/**
 * De HTML de Tiptap a un mensaje de WhatsApp.
 *
 * Las descripciones se escriben en el editor del panel y se guardan con
 * marcado. Medido sobre el catálogo real: `<p>`, `<strong>`, `<li>`, `<br>`,
 * `<ul>`, `<em>`, `<span>`, `<mark>` y `<h3>`, y ni una sola entidad HTML.
 *
 * Los saltos de párrafo y de línea se conservan porque separan ideas, y las
 * viñetas se vuelven «•», que es como se escribe una lista por WhatsApp. Lo
 * demás se cae: allí no hay negritas y una etiqueta suelta se leería literal.
 */
export function cleanDescription(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h[1-6]|div)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    // Por si el editor llegara a emitir entidades algún día; hoy no hay ninguna.
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lo que cabe cómodo en un mensaje sin que parezca un volcado. */
export const DESCRIPTION_MAX_LENGTH = 600;

export function trimForWhatsApp(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;
  const corte = text.slice(0, DESCRIPTION_MAX_LENGTH);
  // Se corta en la última frase entera para no dejarla a medias.
  const punto = Math.max(corte.lastIndexOf(". "), corte.lastIndexOf("\n"));
  return `${(punto > 200 ? corte.slice(0, punto + 1) : corte).trim()}…`;
}

export async function resolveAvailability(
  storeId: string,
  classification: ProductClassification,
): Promise<FactValue<SearchResult<AvailabilityMatch>>> {
  const found = await runSearch(storeId, buildSearchQuery(classification));
  if (!found) return { known: false };
  return {
    known: true,
    value: {
      // Aquí muere `stock`: de este map sale un sí o un no, nunca un número.
      matches: found.rows.map((p) => ({ name: p.name, inStock: p.stock > 0 })),
      ids: found.rows.map((p) => p.id),
      total: found.total,
      hasMore: found.total > PRODUCT_MATCH_LIMIT,
      photo: found.total === 1 ? pickPhoto(found.rows[0]?.images) : null,
    },
  };
}

export async function resolveProductPrice(
  storeId: string,
  classification: ProductClassification,
): Promise<FactValue<SearchResult<ProductMatch>>> {
  // Mismo resultado que la búsqueda: para el precio hace falta lo mismo, y la
  // lista de desambiguación ya lleva los precios, así que sirve de respuesta.
  return resolveProductSearch(storeId, classification);
}

export interface FeaturesMatch {
  name: string;
  description: string;
}

export async function resolveProductFeatures(
  storeId: string,
  classification: ProductClassification,
): Promise<FactValue<SearchResult<FeaturesMatch> | SearchResult<ProductMatch>>> {
  const found = await runSearch(storeId, buildSearchQuery(classification), {
    withDescription: true,
  });
  if (!found) return { known: false };

  // Con varios candidatos no se puede contar de cuál: primero hay que saber
  // cuál. Se devuelven como la búsqueda, con nombre y precio, para preguntar.
  if (found.total !== 1) {
    return {
      known: true,
      value: {
        matches: found.rows.map((p) => ({ name: p.name, price: p.price })),
        ids: found.rows.map((p) => p.id),
        total: found.total,
        hasMore: found.total > PRODUCT_MATCH_LIMIT,
        photo: null,
      },
    };
  }

  const only = found.rows[0];
  const description = cleanDescription(only.description);
  // Una descripción de dos palabras se lee peor que un «déjame preguntarle a
  // Paula»: no se manda, se escala. Son ~168 de los 845 productos activos.
  if (description.length < MIN_USEFUL_DESCRIPTION_LENGTH) return { known: false };

  return {
    known: true,
    value: {
      matches: [{ name: only.name, description: trimForWhatsApp(description) }],
      ids: [only.id],
      total: 1,
      hasMore: false,
      photo: pickPhoto(only.images),
    },
  };
}

// --- 3. Los textos ---------------------------------------------------------

export function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

const linea = (name: string, detalle: string) => `• ${name} — ${detalle}`;

/**
 * Mismo tono que los acuses y que los datos del negocio: cercano, corto y
 * ofreciendo, nunca empujando. Cambiar cualquiera de estos textos cambia
 * `PRODUCT_TEMPLATES_VERSION` y retira el visto bueno de Paula.
 */
export const PRODUCT_TEMPLATES = {
  "search.none": () =>
    `Ay, eso no lo tengo por ahora 💛 Te aviso apenas llegue.`,
  "search.one": (name: string, price: string) =>
    `Sí 💛 Tengo ${name} en ${price}. ¿Te lo aparto?`,
  "search.few": (lineas: string) =>
    `Sí, mira 💛 Tengo estos:\n${lineas}\n¿Cuál te interesa?`,
  "search.many": (lineas: string, resto: number) =>
    `Sí, tengo varios 💛 Estos son los que más salen:\n${lineas}\n…y ${resto} más. Dime cuál te interesa y te cuento.`,
  "availability.none": () =>
    `Ay, eso no lo tengo por ahora 💛 Te aviso apenas llegue.`,
  "availability.one.yes": (name: string) =>
    `¡Sí! Tengo ${name} disponible 💛 ¿Te lo aparto?`,
  "availability.one.no": (name: string) =>
    `${name} se me agotó por ahora 💛 Si quieres te aviso apenas vuelva a entrar.`,
  "availability.few": (lineas: string) =>
    `Tengo estos 💛\n${lineas}\n¿Cuál te interesa?`,
  "availability.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál te interesa.`,
  "price.one": (name: string, price: string) =>
    `${name} está en ${price} 💛 ¿Te lo aparto?`,
  "price.few": (lineas: string) =>
    `Mira 💛\n${lineas}\n¿Cuál te interesa?`,
  "price.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál y te paso el precio.`,
  "features.one": (name: string, description: string) =>
    `${name} 💛\n${description}\n¿Te cuento algo más?`,
  "features.which": (lineas: string) =>
    `¿Cuál de estos? 💛\n${lineas}\nDime cuál y te cuento cómo es.`,
  "photo.one": (name: string, price: string) =>
    `Mira 💛 ${name} — ${price}. ¿Te lo aparto?`,
  "photo.none.usable": (name: string, price: string) =>
    `${name} está en ${price} 💛 No tengo foto de ese a la mano, pero le digo a Paula que te la mande.`,
  "features.which.many": (lineas: string, resto: number) =>
    `Tengo varios 💛\n${lineas}\n…y ${resto} más. Dime cuál y te cuento cómo es.`,
  // Señaló una opción de una lista que ya no está: pasaron más de diez minutos
  // o el número no existía. Se admite el despiste en vez de escalar.
  "reference.lost": () =>
    `Se me fue el hilo 💛 ¿Me dices otra vez cuál te interesa? Puedes escribir el nombre o el número de la lista.`,
  // La lista tocable. El cuerpo no repite las opciones: están en la lista, y
  // repetirlas sería el muro de texto que esto viene a quitar.
  "list.body.few": (cuantos: number) =>
    `Sí 💛 Tengo ${cuantos} que te pueden servir. Míralos y escoge el que quieras.`,
  "list.body.many": (cuantos: number, resto: number) =>
    `Sí, tengo varios 💛 Aquí van ${cuantos}, y me quedan ${resto} más. Toca el que te guste, o dime algo más preciso y te busco mejor.`,
  "list.button": () => `Ver opciones`,
  "list.section": () => `Elige uno`,
  "list.footer": () => `O escríbeme y te ayudo`,
} as const;

export const PRODUCT_TEMPLATES_VERSION = createHash("sha256")
  .update(
    Object.entries(PRODUCT_TEMPLATES)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, render]) =>
          `${key}:${(render as (...args: never[]) => string)(
            "«»" as never,
            0 as never,
          )}`,
      )
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 32);

/**
 * Los textos con un ejemplo, para que Paula los lea antes de aprobarlos.
 *
 * Aquí sí son inventados y se dice: lo que conteste el bot depende de lo que
 * pregunten y de lo que haya en el catálogo en ese momento, así que no hay un
 * «dato real» que enseñar como en los datos del negocio.
 */
export function previewProductTemplates(): { label: string; text: string }[] {
  const uno: SearchResult<ProductMatch> = {
    matches: [{ name: "Cuaderno argollado Stitch", price: 18000 }],
    total: 1,
    hasMore: false,
  };
  const varios: SearchResult<ProductMatch> = {
    matches: [
      { name: "Cuaderno argollado Stitch", price: 18000 },
      { name: "Libreta Stitch", price: 12000 },
      { name: "Llavero Stitch", price: 9000 },
    ],
    total: 3,
    hasMore: false,
  };
  const muchos: SearchResult<ProductMatch> = { ...varios, total: 6, hasMore: true };
  const sinNada: SearchResult<ProductMatch> = { matches: [], total: 0, hasMore: false };

  const dispUno = (inStock: boolean): SearchResult<AvailabilityMatch> => ({
    matches: [{ name: "Cartuchera Capibara", inStock }],
    total: 1,
    hasMore: false,
  });
  const dispVarios: SearchResult<AvailabilityMatch> = {
    matches: [
      { name: "Cartuchera Capibara", inStock: true },
      { name: "Cartuchera Capibara grande", inStock: false },
    ],
    total: 2,
    hasMore: false,
  };

  return [
    { label: "Busca algo y hay uno solo", text: renderProductSearch(uno) },
    { label: "Busca algo y hay varios", text: renderProductSearch(varios) },
    { label: "Busca algo y hay muchos", text: renderProductSearch(muchos) },
    { label: "Busca algo que no tenemos", text: renderProductSearch(sinNada) },
    { label: "Pregunta si queda y sí", text: renderAvailability(dispUno(true)) },
    { label: "Pregunta si queda y se agotó", text: renderAvailability(dispUno(false)) },
    { label: "Pregunta si queda y hay varios", text: renderAvailability(dispVarios) },
    { label: "Pregunta el precio de uno solo", text: renderProductPrice(uno) },
    { label: "Pregunta el precio y hay varios", text: renderProductPrice(varios) },
    {
      label: "Pregunta cómo es un producto",
      text: renderProductFeatures({
        matches: [
          {
            name: "Portacarnet Doraemon",
            description:
              "Lleva tu identificación con la ternura y diversión de Doraemon.\n\nIncluye un protector rígido transparente y una cinta para cuello estampada.",
          },
        ],
        total: 1,
        hasMore: false,
      }),
    },
    {
      label: "Pregunta cómo es, pero hay varios",
      text: renderProductFeatures(varios),
    },
    {
      label: "Pide una foto y hay una",
      text: renderProductPhoto({ ...uno, photo: "https://…/foto.jpg" }),
    },
    {
      label: "Pide una foto pero no tenemos ninguna",
      text: renderProductPhoto({ ...uno, photo: null }),
    },
    {
      label: "Dice «el primero» y la lista ya caducó",
      text: PRODUCT_TEMPLATES["reference.lost"](),
    },
    {
      label: "Cuando hay varios, la lista para tocar",
      text: previewList(),
    },
  ];
}

/**
 * La lista escrita como se ve en el teléfono.
 *
 * Paula aprueba lo que lee la clienta, y aquí lo que cambia no es solo el
 * texto sino la forma: un botón que abre una lista de opciones tocables. Con
 * las palabras sueltas no se entendería, así que se dibuja.
 */
function previewList(): string {
  const ejemplo = [
    { name: "Carpeta plástica oficio verde pastel", price: 12000 },
    { name: "Carpeta plástica oficio rosada", price: 12000 },
    { name: "Carpeta plástica oficio azul pastel", price: 12000 },
  ];
  const filas = buildProductRows(
    ejemplo,
    ejemplo.map((_, i) => `ejemplo-${i}`),
  );
  const dibujo = [
    ...filas.map((f) => `   ▸ ${f.title}\n     ${f.description}`),
    `   ▸ ${TALK_TO_OWNER_BUTTON_TITLE}`,
  ].join("\n");
  return [
    PRODUCT_TEMPLATES["list.body.few"](ejemplo.length),
    ``,
    `[ ${PRODUCT_TEMPLATES["list.button"]()} ] ← la clienta toca aquí y se abre:`,
    ``,
    `   ${PRODUCT_TEMPLATES["list.section"]()}`,
    dibujo,
    ``,
    PRODUCT_TEMPLATES["list.footer"](),
  ].join("\n");
}

export function areProductAnswersApproved(s: {
  botProductsApprovedAt: Date | null;
  botProductsVersion: string | null;
}): boolean {
  return (
    s.botProductsApprovedAt !== null &&
    s.botProductsVersion === PRODUCT_TEMPLATES_VERSION
  );
}

export function renderProductPrice(result: SearchResult<ProductMatch>): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.none"]();
  if (result.total === 1) {
    return t["price.one"](result.matches[0].name, formatCOP(result.matches[0].price));
  }
  // La lista ya lleva los precios, así que con dos o tres la pregunta queda
  // contestada en el mismo mensaje aunque nadie diga después cuál era.
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["price.many"](lineas, result.total - result.matches.length)
    : t["price.few"](lineas);
}

export function renderProductFeatures(
  result: SearchResult<FeaturesMatch> | SearchResult<ProductMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.none"]();
  const first = result.matches[0];
  if (result.total === 1 && first && "description" in first) {
    return t["features.one"](first.name, first.description);
  }
  const lineas = (result.matches as ProductMatch[])
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["features.which.many"](lineas, result.total - result.matches.length)
    : t["features.which"](lineas);
}

export function renderProductPhoto(result: SearchResult<ProductMatch>): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.none"]();
  if (result.total === 1) {
    const only = result.matches[0];
    const precio = formatCOP(only.price);
    // Sin foto utilizable se avisa, porque aquí LA FOTO era lo que pedía.
    return result.photo
      ? t["photo.one"](only.name, precio)
      : t["photo.none.usable"](only.name, precio);
  }
  // Con varios no se manda ninguna foto: primero hay que saber cuál.
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["price.many"](lineas, result.total - result.matches.length)
    : t["price.few"](lineas);
}

export function renderProductSearch(result: SearchResult<ProductMatch>): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["search.none"]();
  if (result.total === 1) {
    return t["search.one"](result.matches[0].name, formatCOP(result.matches[0].price));
  }
  const lineas = result.matches
    .map((m) => linea(m.name, formatCOP(m.price)))
    .join("\n");
  return result.hasMore
    ? t["search.many"](lineas, result.total - result.matches.length)
    : t["search.few"](lineas);
}

export function renderAvailability(
  result: SearchResult<AvailabilityMatch>,
): string {
  const t = PRODUCT_TEMPLATES;
  if (result.total === 0) return t["availability.none"]();
  if (result.total === 1) {
    const only = result.matches[0];
    return only.inStock
      ? t["availability.one.yes"](only.name)
      : t["availability.one.no"](only.name);
  }
  const lineas = result.matches
    .map((m) => linea(m.name, m.inStock ? "disponible" : "agotado por ahora"))
    .join("\n");
  return result.hasMore
    ? t["availability.many"](lineas, result.total - result.matches.length)
    : t["availability.few"](lineas);
}

// --- 4. La lista tocable ------------------------------------------------

/** Corta por la última palabra entera que quepa; «…» avisa de que se cortó. */
function recortar(texto: string, max: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max / 3 ? corte.slice(0, espacio) : corte).trim()}…`;
}

/** Lo mismo pero por el final: conserva lo que distingue, que suele ir ahí. */
function recortarPorElFinal(texto: string, max: number): string {
  const palabras = texto.replace(/\s+/g, " ").trim().split(" ");
  const cola: string[] = [];
  for (let i = palabras.length - 1; i >= 0; i -= 1) {
    const prueba = [palabras[i], ...cola].join(" ");
    if (prueba.length > max - 1) break;
    cola.unshift(palabras[i]);
  }
  return cola.length > 0 ? `…${cola.join(" ")}` : recortar(texto, max);
}

/** Las palabras que TODOS comparten al principio, sin dejar a nadie sin nada. */
function prefijoComun(nombres: string[]): number {
  if (nombres.length < 2) return 0;
  const palabras = nombres.map((n) => n.replace(/\s+/g, " ").trim().split(" "));
  let comunes = 0;
  const minimo = Math.min(...palabras.map((p) => p.length));
  while (comunes < minimo - 1) {
    const palabra = palabras[0][comunes].toLowerCase();
    if (!palabras.every((p) => p[comunes].toLowerCase() === palabra)) break;
    comunes += 1;
  }
  return comunes;
}

/**
 * Títulos cortos y, sobre todo, distintos entre sí. Se quita lo que todos
 * repiten al principio y queda lo que los separa; si aún coinciden se prueba
 * por el final, y si no, se numeran. El nombre entero va en la descripción.
 */
export function buildRowTitles(nombres: string[]): string[] {
  const limpios = nombres.map((n) => n.replace(/\s+/g, " ").trim());
  const comunes = prefijoComun(limpios);
  const base = limpios.map((n) => {
    const palabras = n.split(" ");
    const resto = palabras.slice(comunes).join(" ");
    return resto || n;
  });

  const titulos = base.map((n) => recortar(n, WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH));

  // Segunda pasada: a los repetidos se les mira la cola.
  const cuenta = new Map<string, number>();
  titulos.forEach((t) => cuenta.set(t, (cuenta.get(t) ?? 0) + 1));
  const segunda = titulos.map((t, i) =>
    (cuenta.get(t) ?? 0) > 1
      ? recortarPorElFinal(base[i], WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH)
      : t,
  );

  // Último recurso: numerarlos. Feo, pero nunca dos iguales.
  const vistos = new Set<string>();
  return segunda.map((t) => {
    if (!vistos.has(t)) {
      vistos.add(t);
      return t;
    }
    for (let n = 2; ; n += 1) {
      const sufijo = ` (${n})`;
      const corto = `${recortar(t, WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH - sufijo.length)}${sufijo}`;
      if (!vistos.has(corto)) {
        vistos.add(corto);
        return corto;
      }
    }
  });
}

/**
 * Las filas de producto, listas para mandar.
 *
 * El id lleva el producto, así que lo que se toca no depende de lo que se lee:
 * el título puede estar recortado y la respuesta sigue siendo la correcta.
 */
export function buildProductRows(
  matches: ProductMatch[],
  ids: string[],
): WhatsAppListRow[] {
  const titulos = buildRowTitles(matches.map((m) => m.name));
  return matches
    .map((m, i) => ({ m, id: ids[i], title: titulos[i] }))
    .filter((r) => Boolean(r.id))
    .map((r) => ({
      id: buildProductRowId(r.id),
      title: r.title,
      // El nombre entero cabe: ninguno de los 845 del catálogo pasa de 72, y
      // con el precio al lado la fila ya dice todo lo que decía el texto.
      description: recortar(
        `${r.m.name} — ${formatCOP(r.m.price)}`,
        WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
      ),
    }));
}

/** Igual, pero cuando lo que se preguntó fue si queda. */
export function buildAvailabilityRows(
  matches: AvailabilityMatch[],
  ids: string[],
): WhatsAppListRow[] {
  const titulos = buildRowTitles(matches.map((m) => m.name));
  return matches
    .map((m, i) => ({ m, id: ids[i], title: titulos[i] }))
    .filter((r) => Boolean(r.id))
    .map((r) => ({
      id: buildProductRowId(r.id),
      title: r.title,
      description: recortar(
        `${r.m.name} — ${r.m.inStock ? "disponible" : "agotado por ahora"}`,
        WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
      ),
    }));
}

/** El texto que acompaña a la lista; no repite las opciones, ya están dentro. */
export function buildListBody(mostrados: number, total: number): string {
  return total > mostrados
    ? PRODUCT_TEMPLATES["list.body.many"](mostrados, total - mostrados)
    : PRODUCT_TEMPLATES["list.body.few"](mostrados);
}

/** La fila de Paula, siempre la última. Mismo id que su botón de siempre. */
export function buildOwnerRow(): WhatsAppListRow {
  return { id: TALK_TO_OWNER_BUTTON_ID, title: TALK_TO_OWNER_BUTTON_TITLE };
}

// --- Unir las tres piezas --------------------------------------------------

export interface ProductAnswer {
  intent: ProductIntent;
  text: string;
  /** Va con la respuesta cuando hay un solo producto y tiene foto sana. */
  photo?: string | null;
  /**
   * Lo que se acaba de enseñar, en el orden en que sale escrito. Se guarda con
   * el mensaje para que «el primero» tenga a qué referirse.
   */
  shownIds?: string[];
  /**
   * Cuando hay varios, se manda como lista tocable en vez de como texto.
   * `text` sigue siendo la versión escrita, que es a la que se cae si Meta
   * rechaza la lista: perder la lista es un detalle, callar no.
   */
  list?: { body: string; rows: WhatsAppListRow[] };
}

/**
 * La respuesta sobre productos, o `null` si aquí no hay nada que contestar:
 * el mensaje no iba de esto, el modelo no pudo, o no se entendió qué buscaba.
 * Un `null` nunca es el final del camino, solo significa «que siga».
 */
const MARCA_LENTA = Symbol("lenta");

/**
 * Clasifica y, si tarda, avisa.
 *
 * El aviso no interrumpe nada: se sigue esperando la misma respuesta. Quien
 * manda el mensaje es `bot.ts` —aquí no se envía nada por WhatsApp, y eso no
 * cambia—, así que esto solo sabe CUÁNDO merece la pena avisar.
 */
async function clasificarAvisandoSiTarda(
  body: string,
  onSlow?: () => Promise<void>,
): Promise<ClassifyOutcome> {
  const clasificando = classifyProductQuestion(body);
  if (!onSlow) return clasificando;

  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const aviso = new Promise<typeof MARCA_LENTA>((resolve) => {
    temporizador = setTimeout(() => resolve(MARCA_LENTA), PRODUCT_CLASSIFIER_SLOW_NOTICE_MS);
  });

  try {
    const primero = await Promise.race([clasificando, aviso]);
    if (primero === MARCA_LENTA) {
      // Si el aviso no sale, mala suerte: lo que no puede es tumbar la
      // respuesta de verdad, que es la que la clienta está esperando.
      try {
        await onSlow();
      } catch (error) {
        console.warn("[WHATSAPP_BOT] No se pudo avisar de que iba lento", { error });
      }
    }
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }

  return clasificando;
}

export async function answerProductQuestion(
  storeId: string,
  body: string,
  options: { onSlow?: () => Promise<void> } = {},
): Promise<ProductAnswer | null> {
  if (!looksLikeProductQuestion(body)) return null;

  const classified = await clasificarAvisandoSiTarda(body, options.onSlow);
  if (!classified.ok) {
    // Sin cuota es lo esperable en horas punta, no una avería: se anota flojito
    // y el mensaje sigue. Lo demás sí merece mirarse.
    const log = classified.reason === "quota" ? console.warn : console.error;
    log("[WHATSAPP_BOT] no se pudo clasificar la pregunta de producto", {
      storeId,
      reason: classified.reason,
    });
    return null;
  }

  const c = classified.value;
  if (c.intent === "other") return null;

  // Si las tres ranuras vienen vacías, se busca el mensaje en crudo antes de
  // darse por vencido: casi siempre queda ahí lo que hace falta.
  let consulta = buildSearchQuery(c);
  if (searchTokens(consulta).length === 0) {
    consulta = fallbackQueryFromMessage(body);
    if (consulta) {
      console.info("[WHATSAPP_BOT] Sin ranuras; se busca el mensaje en crudo", {
        storeId, consulta,
      });
    }
  }
  // Con UNA sola palabra no se contesta.
  //
  // «útiles» encontraba ocho productos y se los enseñaba como si fueran la
  // respuesta; era un listado al azar con cara de respuesta. Nombrar algo
  // concreto lleva casi siempre dos palabras —«lapiceros gel», «cuaderno
  // Stitch»—, y con una sola lo honesto es pasárselo a Paula, que sí puede
  // preguntar qué necesita.
  if (searchTokens(consulta).length < MIN_SEARCH_TOKENS) {
    if (searchTokens(consulta).length > 0) {
      console.info("[WHATSAPP_BOT] Pregunta demasiado vaga; no se adivina", {
        storeId, consulta,
      });
    }
    return null;
  }
  // A partir de aquí se busca `consulta`, no las ranuras sueltas.
  const buscar: ProductClassification = {
    ...c,
    productType: consulta,
    character: null,
    descriptor: null,
  };

  if (c.intent === "product.availability") {
    const fact = await resolveAvailability(storeId, buscar);
    if (!fact.known) return null;
    return {
      intent: c.intent,
      text: renderAvailability(fact.value),
      photo: fact.value.photo,
      shownIds: fact.value.ids,
      list: listaSiHayVarios(
        fact.value,
        buildAvailabilityRows(fact.value.matches, fact.value.ids ?? []),
      ),
    };
  }

  if (c.intent === "product.price") {
    const fact = await resolveProductPrice(storeId, buscar);
    if (!fact.known) return null;
    return {
      intent: c.intent,
      text: renderProductPrice(fact.value),
      photo: fact.value.photo,
      shownIds: fact.value.ids,
      list: listaSiHayVarios(
        fact.value,
        buildProductRows(fact.value.matches as ProductMatch[], fact.value.ids ?? []),
      ),
    };
  }

  if (c.intent === "product.features") {
    // El único caso que se escala por falta de datos: hay UN producto claro
    // pero su descripción no da para contar nada.
    const fact = await resolveProductFeatures(storeId, buscar);
    if (!fact.known) return null;
    return {
      intent: c.intent,
      text: renderProductFeatures(fact.value),
      photo: fact.value.photo,
      shownIds: fact.value.ids,
      list: listaSiHayVarios(
        fact.value,
        buildProductRows(fact.value.matches as ProductMatch[], fact.value.ids ?? []),
      ),
    };
  }

  if (c.intent === "product.photo") {
    const fact = await resolveProductSearch(storeId, buscar);
    if (!fact.known) return null;
    return {
      intent: c.intent,
      text: renderProductPhoto(fact.value),
      photo: fact.value.photo,
      shownIds: fact.value.ids,
      list: listaSiHayVarios(fact.value, buildProductRows(fact.value.matches, fact.value.ids ?? [])),
    };
  }

  const fact = await resolveProductSearch(storeId, buscar);
  if (!fact.known) return null;
  return {
    intent: c.intent,
    text: renderProductSearch(fact.value),
    photo: fact.value.photo,
    shownIds: fact.value.ids,
    list: listaSiHayVarios(fact.value, buildProductRows(fact.value.matches, fact.value.ids ?? [])),
  };
}

/**
 * Con uno solo no hay nada que elegir: va la respuesta de siempre, con su foto.
 * La lista es para cuando hay que decidir.
 */
function listaSiHayVarios(
  result: { total: number; ids?: string[] },
  rows: WhatsAppListRow[],
): { body: string; rows: WhatsAppListRow[] } | undefined {
  if (result.total < 2 || rows.length < 2) return undefined;
  return { body: buildListBody(rows.length, result.total), rows };
}

/**
 * La respuesta sobre un producto ya identificado. Se vuelve a consultar el
 * catálogo: el precio y las existencias pueden haber cambiado.
 */
export async function answerAboutProduct(
  storeId: string,
  productId: string,
  intent: ProductIntent,
): Promise<ProductAnswer | null> {
  const producto = (await prismadb.product.findFirst({
    where: { id: productId, storeId, isArchived: false },
    select: {
      ...MATCH_SELECT,
      description: true,
      images: {
        where: { brokenAt: null },
        orderBy: { isMain: "desc" as const },
        select: { url: true },
        take: 1,
      },
    },
  })) as {
    id: string;
    name: string;
    price: number;
    stock: number;
    description: string | null;
    images: { url: string }[];
  } | null;
  if (!producto) return null;

  const foto = pickPhoto(producto.images);
  const base = { total: 1, hasMore: false, ids: [producto.id], photo: foto };
  const comun = { intent, photo: foto, shownIds: [producto.id] };

  if (intent === "product.availability") {
    return {
      ...comun,
      text: renderAvailability({
        ...base,
        matches: [{ name: producto.name, inStock: producto.stock > 0 }],
      }),
    };
  }

  if (intent === "product.features") {
    const descripcion = cleanDescription(producto.description);
    // Igual que en la búsqueda: sin descripción utilizable no se inventa nada.
    if (descripcion.length < MIN_USEFUL_DESCRIPTION_LENGTH) return null;
    return {
      ...comun,
      text: renderProductFeatures({
        ...base,
        matches: [{ name: producto.name, description: trimForWhatsApp(descripcion) }],
      }),
    };
  }

  const uno: SearchResult<ProductMatch> = {
    ...base,
    matches: [{ name: producto.name, price: producto.price }],
  };
  if (intent === "product.price") return { ...comun, text: renderProductPrice(uno) };
  if (intent === "product.photo") return { ...comun, text: renderProductPhoto(uno) };
  return { ...comun, text: renderProductSearch(uno) };
}
