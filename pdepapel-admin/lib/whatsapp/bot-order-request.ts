import { createHash } from "node:crypto";

import { formatBotReply, normalizeBotText } from "@/lib/whatsapp/bot-matching";

/**
 * Pedido por WhatsApp: cuando el bot ofreció UN producto («… ¿Lo quieres?») y
 * la clienta dice que sí, el bot no aparta ni cobra nada: le pasa el pedido a
 * Paula con un texto aprobado y deja anotado qué pidió (producto, cantidad,
 * precio que se le mostró) para que lo vea en el panel.
 *
 * Aquí solo hay reglas puras: textos, detección y formato. Las lecturas de la
 * base las hacen `bot.ts` y el modo sombra.
 */

/** Cuánto vale una oferta del bot para un «sí». */
export const ORDER_OFFER_WINDOW_MS = 30 * 60 * 1000;
/** Más que esto no se promete: Paula confirma. */
export const MAX_ORDER_QUANTITY = 20;

/** Cómo cierran las cuatro plantillas de un solo producto (la vieja sigue en mensajes ya enviados). */
const OFFER_CLOSINGS = ["¿Lo quieres?", "¿Te lo aparto?"];

/**
 * Textos de este grupo. Se aprueban aparte de los de productos (columnas
 * `botCasual*`): sin ese visto bueno nada de esto se envía.
 */
export const ORDER_TEMPLATES = {
  "order.requested.one": (producto: string, cantidad: number, precio: string) =>
    `¡Listo! 💛 Le paso tu pedido a Paula: ${producto} × ${cantidad} (${precio}). Ella te escribe para confirmar envío y pago.`,
  "order.requested.many": (lineas: string) =>
    `¡Listo! 💛 Le paso tu pedido a Paula:\n${lineas}\nElla te escribe para confirmar envío y pago.`,
  "order.check_stock": (producto: string, cantidad: number) =>
    `Le paso tu pedido a Paula 💛 ${producto} × ${cantidad}. Ella te confirma si tenemos esa cantidad, el envío y el pago.`,
  "order.appended": (lineas: string) => `Lo sumo a tu pedido 💛 Va así:\n${lineas}\nPaula te escribe para confirmar envío y pago.`,
  /** Escribió desde un botón de la tienda web (lib/whatsapp/web-origin.ts). Cuenta como la bienvenida del día. */
  "web.greeting": () => "¡Hola! 💛 Qué bueno que nos escribes desde la web.",
  "web.cart": () => "¡Hola! 💛 Vi que vienes de tu carrito. ¿Cuál es tu duda? Te ayudo con envío, formas de pago o disponibilidad.",
  "web.order": (numero: string) => `¡Hola! 💛 Recibí tu consulta sobre el pedido #${numero}. Le aviso a Paula para que te responda.`,
  "web.general": () =>
    "¡Hola! 💛 Gracias por escribirnos desde la web. Cuéntame qué producto buscas y te digo precio y disponibilidad. También te ayudo con envíos y formas de pago.",
  "shipping.quote": (umbral: string, tiempo: string) =>
    [
      "El valor del envío depende de tu ciudad y lo cotiza la transportadora 💛",
      umbral ? `Desde ${umbral} en productos el envío es gratis.` : "",
      tiempo ? `Normalmente llega en ${tiempo}.` : "",
      "Paula te confirma el valor exacto.",
    ]
      .filter(Boolean)
      .join(" "),
} as const;

export const ORDER_TEMPLATES_VERSION = createHash("sha256")
  .update(
    Object.entries(ORDER_TEMPLATES)
      .sort(([a], [b]) => a.localeCompare(b))
      // Todas las variables como texto no vacío: así cada frase opcional entra en la huella.
      .map(([key, render]) => `${key}:${(render as (...args: never[]) => string)("«»" as never, "«»" as never, "«»" as never)}`)
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 32);

export function areOrderRepliesApproved(s: { botCasualApprovedAt: Date | null; botCasualVersion: string | null }): boolean {
  return Boolean(s.botCasualApprovedAt) && s.botCasualVersion === ORDER_TEMPLATES_VERSION;
}

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  /** Precio unitario de la base al confirmar; nunca calculado aquí. */
  unitPrice: number;
  /** `false` cuando pidió más de lo que hay o más del tope: Paula confirma. */
  stockConfirmed: boolean;
}

/** Lo que queda guardado en `metadata.orderRequest` del mensaje del bot. */
export interface OrderRequestRecord {
  status: "pending" | "dismissed";
  items: OrderItem[];
  createdAt: string;
  dismissedAt?: string;
  dismissedBy?: string;
}

export const formatOrderLine = (item: OrderItem, money: (value: number) => string) =>
  `• ${item.name} × ${item.quantity} (${money(item.unitPrice)})`;

/** Lo que el bot ofreció con «¿Lo quieres?»: un solo producto, en ese mensaje. */
export function offeredProductId(message: { body: string | null; metadata: unknown } | null): string | null {
  if (!message?.body) return null;
  const body = formatBotReply(message.body);
  if (!OFFER_CLOSINGS.some((closing) => body.endsWith(closing))) return null;
  const ids = (message.metadata as { shown?: { ids?: unknown } } | null)?.shown?.ids;
  return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === "string" ? ids[0] : null;
}

export const isOfferFresh = (offerAt: Date, now: Date) => now.getTime() - offerAt.getTime() <= ORDER_OFFER_WINDOW_MS;

const NUMBER_WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  par: 2, docena: 12,
};

const words = (text: string) => normalizeBotText(text).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);

function quantityIn(tokens: string[]): number | null {
  for (const token of tokens) {
    if (/^\d{1,3}$/.test(token)) return Number(token);
    if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  }
  return null;
}

const YES = new Set(["si", "sii", "siii", "sip", "dale", "listo", "claro", "ok", "okay", "okey", "va", "vale", "bueno", "perfecto", "porfa", "porfavor", "yes", "quiero", "lo", "la", "los", "las", "me", "llevo", "de", "una", "favor", "por", "plis", "please", "obvio", "ya", "ay", "uy", "super"]);
const NEGATIVE = /\b(no|nop|nel|despues|luego|mas tarde|ahorita no|todavia|pensarlo|lo pienso|pero|otro dia|manana)\b/;
const FOLLOW_UP = /\b(?:y\s+)?(?:tambien|ademas)\b/;
const START = /^(si+p?|dale|listo|claro|de una|ok(?:ay|ey)?|va(?:le)?|bueno|perfecto|porfa|por favor|yes|obvio|lo quiero|la quiero|los quiero|las quiero|me lo llevo|me la llevo|quiero)\b/;
/** Palabras de relleno que no son producto en «y también quiero 2 …». */
const FILLER = new Set(["y", "tambien", "ademas", "quiero", "me", "regalas", "das", "pones", "agrega", "agregale", "suma", "sumale", "porfa", "favor", "por", "de", "del", "el", "la", "los", "las", "un", "una", "unos", "unas", "uno", "si"]);

export interface OrderReply {
  quantity: number;
  /** Algo más que pidió en el mismo mensaje («y también 2 lapiceros»). */
  extra: { quantity: number; query: string } | null;
}

/**
 * ¿Es un «sí, lo quiero»? Corto, sin pregunta, sin «no», «pero» ni «más tarde».
 * Una pregunta («sí, ¿cuánto es el envío?») no es confirmación: sigue su camino.
 */
export function parseOrderReply(body: string): OrderReply | null {
  if (/[¿?]/.test(body)) return null;
  const text = normalizeBotText(body).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!text || NEGATIVE.test(text) || !START.test(text)) return null;
  const [head, ...rest] = text.split(FOLLOW_UP);
  const headTokens = words(head);
  if (headTokens.length > 8) return null;
  // La primera parte solo puede tener «sí», relleno y la cantidad.
  if (headTokens.some((token) => !YES.has(token) && !/^\d{1,3}$/.test(token) && !(token in NUMBER_WORDS))) return null;
  const quantity = quantityIn(headTokens) ?? 1;
  const tail = rest.join(" ").trim();
  return { quantity: Math.max(1, quantity), extra: tail ? parseItem(tail) : null };
}

function parseItem(text: string): { quantity: number; query: string } | null {
  const tokens = words(text);
  const quantity = quantityIn(tokens) ?? 1;
  const query = tokens.filter((token) => !FILLER.has(token) && !/^\d{1,3}$/.test(token) && !(token in NUMBER_WORDS)).join(" ");
  return query ? { quantity: Math.max(1, quantity), query } : null;
}

/**
 * Con el pedido ya pasado a Paula: «y también 2 lapiceros», «agrégale un
 * borrador». Sin «también/además/agrega/suma» no se interpreta como añadido.
 */
export function parseAppendRequest(body: string): { quantity: number; query: string } | null {
  if (/[¿?]/.test(body)) return null;
  const text = normalizeBotText(body);
  if (NEGATIVE.test(text) || !/\b(tambien|ademas|agrega|agregale|agregame|suma|sumale|sumame)\b/.test(text)) return null;
  return parseItem(text);
}

/** «¿Cuánto es el envío?», «¿cuánto cuesta el domicilio?». */
export function isShippingCostQuestion(body: string): boolean {
  const text = normalizeBotText(body);
  return /\b(cuanto|valor|costo|precio|cuesta|vale|cobran|sale)\b/.test(text) && /\b(envio|envios|domicilio|domicilios|despacho|flete)\b/.test(text);
}

/** Ejemplos para que Paula lea los textos antes de aprobarlos (inventados). */
export function previewOrderTemplates(money: (value: number) => string): { label: string; text: string }[] {
  const t = ORDER_TEMPLATES;
  const items: OrderItem[] = [
    { productId: "a", name: "Cuaderno argollado Stitch", quantity: 1, unitPrice: 18000, stockConfirmed: true },
    { productId: "b", name: "Lapicero gel negro", quantity: 2, unitPrice: 3500, stockConfirmed: true },
  ];
  return [
    { label: "Dice que sí a un producto", text: t["order.requested.one"](items[0].name, 1, money(items[0].unitPrice)) },
    { label: "Dice que sí y pide algo más en el mismo mensaje", text: t["order.requested.many"](items.map((i) => formatOrderLine(i, money)).join("\n")) },
    { label: "Pide más de lo que hay (no se promete)", text: t["order.check_stock"](items[0].name, 30) },
    { label: "Ya pasado a Paula, suma otro producto", text: t["order.appended"](items.map((i) => formatOrderLine(i, money)).join("\n")) },
    { label: "Escribe desde un producto de la tienda web (saludo + la respuesta de producto de siempre)", text: `${t["web.greeting"]()}\n\nSí 💛 Tengo ${items[0].name} en ${money(items[0].unitPrice)}. ¿Lo quieres?` },
    { label: "Escribe desde el carrito de la tienda web", text: t["web.cart"]() },
    { label: "Escribe desde la página de un pedido (pasa a Paula; nunca da el estado)", text: t["web.order"]("ORD-0000000000000-000") },
    { label: "Escribe desde cualquier otra página de la tienda web", text: t["web.general"]() },
    { label: "Pregunta cuánto vale el envío", text: t["shipping.quote"](money(250000), "2 a 6 días hábiles") },
    { label: "… sin envío gratis ni tiempo configurados", text: t["shipping.quote"]("", "") },
  ];
}
