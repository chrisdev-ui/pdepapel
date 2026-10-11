/**
 * ¿Escribió desde un botón de la tienda web? La tienda abre WhatsApp con un
 * texto ya escrito según la página (pdepapel-store/lib/whatsapp-prefill.ts):
 *
 * - producto: «¡Hola! 👋 Vengo de la tienda web y me interesa: {nombre} (ref {SKU}).»
 * - carrito:  «¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito (ref {SKU}, {SKU}, …).»
 * - pedido:   «¡Hola! 👋 Tengo una pregunta sobre mi pedido #{número} de la tienda web.»
 * - general:  «¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta.»
 *
 * También reconoce los textos viejos («Encontré su contacto en la página
 * web…» y «Tengo una duda sobre mi pedido …»), para que la tienda y el panel
 * se puedan desplegar en cualquier orden. Tolera tildes y emojis quitados y
 * texto de más al final; las referencias y el número de pedido se leen con
 * expresiones estrictas. Pura: no lee la base.
 */

export type WebOriginPage = "product" | "cart" | "order" | "general";

export interface WebOrigin {
  source: "web";
  pageType: WebOriginPage;
  /** SKU tal como los mandó la tienda, en mayúsculas. */
  refs: string[];
  orderNumber: string | null;
  /** El texto viejo de la tienda, sin página ni referencias. */
  legacy: boolean;
  /** Lo que escribió además del texto prellenado (una pregunta de verdad), o `null`. */
  extraText: string | null;
}

/** SKU de la tienda: letras y números en mayúsculas separados por guiones (p. ej. CUA-NOR-5MA-GR-X-0123). */
const REF = /^[A-Z0-9]{1,8}(?:-[A-Z0-9]{1,8}){1,7}$/;
const ORDER = /^[A-Z0-9][A-Z0-9-]{3,39}$/;
const MAX_REFS = 10;

/** Sin tildes ni emojis, en minúsculas, con los espacios colapsados; conserva la puntuación. */
function plain(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e\n]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const cleanRef = (value: string) => value.trim().replace(/[.,;:)]+$/, "").toUpperCase();

/** Lo que queda después del texto prellenado, si es algo más que puntuación. */
function extra(rest: string): string | null {
  const trimmed = rest.replace(/^[\s.,;:!¡?¿…-]+/, "").trim();
  return /[a-z0-9]{2,}/i.test(plain(trimmed)) ? trimmed : null;
}

interface Pattern {
  pageType: WebOriginPage;
  legacy: boolean;
  regex: RegExp;
  /** Del resultado de la expresión: referencias y número de pedido. */
  read: (match: RegExpMatchArray) => { refs: string[]; orderNumber: string | null } | null;
}

const PATTERNS: Pattern[] = [
  {
    pageType: "product",
    legacy: false,
    regex: /^(?:hola\s*!?\s*)?vengo de la tienda web y me interesa:?\s*(.{1,200}?)\s*\(\s*ref\.?\s*:?\s*([a-z0-9-]{3,40})\s*\)\s*\.?/,
    read: (match) => {
      const ref = cleanRef(match[2]);
      return REF.test(ref) ? { refs: [ref], orderNumber: null } : null;
    },
  },
  {
    pageType: "cart",
    legacy: false,
    regex: /^(?:hola\s*!?\s*)?vengo de la tienda web,?\s*tengo una duda con mi carrito\s*(?:\(\s*ref\.?\s*:?\s*([a-z0-9 ,-]{0,400}?)(?:\s*y mas)?\s*\))?\s*\.?/,
    read: (match) => {
      const refs = (match[1] ?? "")
        .split(",")
        .map(cleanRef)
        .filter(Boolean);
      if (refs.some((ref) => !REF.test(ref)) || refs.length > MAX_REFS) return null;
      return { refs, orderNumber: null };
    },
  },
  {
    pageType: "order",
    legacy: false,
    regex: /^(?:hola\s*!?\s*)?tengo una pregunta sobre mi pedido\s*#\s*([a-z0-9-]{4,40})\s*de la tienda web\s*\.?/,
    read: (match) => {
      const order = cleanRef(match[1]);
      return ORDER.test(order) ? { refs: [], orderNumber: order } : null;
    },
  },
  {
    pageType: "general",
    legacy: false,
    regex: /^(?:hola\s*!?\s*)?vengo de la tienda web y quiero hacer una consulta\s*\.?/,
    read: () => ({ refs: [], orderNumber: null }),
  },
  {
    pageType: "order",
    legacy: true,
    regex: /^(?:hola\s*!?\s*)?tengo una duda sobre mi pedido\s*#?\s*([a-z0-9-]{4,40})\s*\.?/,
    read: (match) => {
      const order = cleanRef(match[1]);
      return ORDER.test(order) && /\d/.test(order) ? { refs: [], orderNumber: order } : null;
    },
  },
  {
    pageType: "general",
    legacy: true,
    regex: /^(?:hola\s*!?\s*)?encontre su contacto en la pagina web\.?\s*(?:me gustaria consultar sobre\s*(?:\.\.\.)?)?/,
    read: () => ({ refs: [], orderNumber: null }),
  },
];

export function detectWebOrigin(body: string | null | undefined): WebOrigin | null {
  if (!body) return null;
  const text = plain(body).replace(/^[!. ]+/, "");
  for (const pattern of PATTERNS) {
    const match = text.match(pattern.regex);
    if (!match) continue;
    const read = pattern.read(match);
    if (!read) return null;
    return {
      source: "web",
      pageType: pattern.pageType,
      legacy: pattern.legacy,
      refs: read.refs,
      orderNumber: read.orderNumber,
      extraText: extra(text.slice(match[0].length)),
    };
  }
  return null;
}
