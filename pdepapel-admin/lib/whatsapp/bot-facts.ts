import { createHash } from "node:crypto";

import { MinimumOrderRule } from "@prisma/client";

import { formatOpeningHours, type ResolvedStoreSettings } from "@/lib/store-settings";
import { normalizeBotText } from "@/lib/whatsapp/bot-matching";

/**
 * Datos del negocio por WhatsApp.
 *
 * Seis preguntas que la gente hace todo el rato y que tienen UNA respuesta
 * correcta guardada en algún lado. Nada de esto adivina: cada intención tiene
 * un resolvedor que lee el dato de verdad y dice si lo sabe o no. Si no lo
 * sabe, no se inventa nada —la conversación sigue su camino de siempre hasta
 * quedar en manos de Paula—.
 *
 * Deterministas a propósito (etapa A): se reconoce por palabras, sin modelo de
 * lenguaje de por medio. Son preguntas de poca variedad y así no hay nada que
 * pueda fallar, encarecer ni inventarse una respuesta.
 */

export type BusinessFactIntent =
  | "business.hours"
  | "business.city"
  | "business.physical_store"
  | "business.min_order"
  | "shipping.free_threshold"
  | "shipping.delivery_days";

/** Lo que devuelve un resolvedor: el valor de verdad, o que no se sabe. */
export type FactValue<T> = { known: true; value: T } | { known: false };

const unknown = { known: false } as const;
const known = <T,>(value: T): FactValue<T> => ({ known: true, value });

// --- Reconocer la pregunta -------------------------------------------------

/**
 * Cada intención con sus frases. Gana la que tenga la coincidencia MÁS LARGA,
 * no la primera: «cuánto vale el envío» y «envío gratis» comparten la palabra
 * «envío», y sin esta regla la respuesta dependería del orden de la lista.
 */
const PATTERNS: Record<BusinessFactIntent, string[]> = {
  "business.hours": [
    "horario", "que hora abren", "a que hora abren", "a que hora cierran",
    "hasta que hora", "estan abiertos", "estan abiertas", "atienden hoy",
    "a que horas atienden", "horarios de atencion",
  ],
  "business.city": [
    "en que ciudad", "de donde son", "donde quedan", "donde estan ubicados",
    "de que ciudad", "en que parte quedan", "son de medellin",
  ],
  "business.physical_store": [
    "tienda fisica", "local fisico", "puedo ir a", "tienen local",
    "se puede recoger", "recoger en tienda", "tienen punto de venta",
    "cual es la direccion", "puedo pasar a",
  ],
  "business.min_order": [
    "pedido minimo", "compra minima", "monto minimo", "minimo de compra",
    "hay un minimo", "cuanto es lo minimo",
  ],
  "shipping.free_threshold": [
    "envio gratis", "envios gratis", "gratis el envio", "para que salga gratis",
    "desde cuanto es gratis", "cuanto para envio gratis",
  ],
  "shipping.delivery_days": [
    "cuanto se demora", "cuanto tarda", "cuantos dias", "en cuanto llega",
    "cuando llega", "cuanto demora el envio", "tiempo de entrega",
    "cuanto se tarda en llegar",
  ],
};

export function classifyBusinessFact(body: string): BusinessFactIntent | null {
  const text = normalizeBotText(body);
  if (!text) return null;

  let best: { intent: BusinessFactIntent; length: number } | null = null;
  for (const [intent, phrases] of Object.entries(PATTERNS)) {
    for (const phrase of phrases) {
      if (text.includes(phrase) && (!best || phrase.length > best.length)) {
        best = { intent: intent as BusinessFactIntent, length: phrase.length };
      }
    }
  }
  return best?.intent ?? null;
}

// --- Leer el dato de verdad ------------------------------------------------

export interface MinOrderFact {
  rule: MinimumOrderRule;
  amount: number | null;
}

export function resolveHours(s: ResolvedStoreSettings): FactValue<string> {
  // `formatOpeningHours` ya sabe que con `alwaysOpen` el horario por día no se
  // mira; es el mismo texto que muestran el pie de página y /nosotros.
  const label = formatOpeningHours(s.openingHours, s.alwaysOpen);
  return label ? known(label) : unknown;
}

export function resolveCity(s: ResolvedStoreSettings): FactValue<string> {
  return s.cityName?.trim() ? known(s.cityName.trim()) : unknown;
}

export function resolvePhysicalStore(
  s: ResolvedStoreSettings,
): FactValue<{ has: boolean; address: string | null }> {
  // «No tenemos local» es una respuesta tan buena como la dirección; lo que no
  // se puede es decir que sí y no saber dónde.
  if (!s.hasPhysicalStore) return known({ has: false, address: null });
  const address = s.physicalAddress?.trim();
  return address ? known({ has: true, address }) : unknown;
}

export function resolveMinOrder(
  s: ResolvedStoreSettings,
): FactValue<MinOrderFact> {
  if (s.minOrderRule === MinimumOrderRule.FIXED && !s.minOrderAmount) {
    return unknown;
  }
  if (s.minOrderRule === MinimumOrderRule.MATCH_SHIPPING) {
    return s.freeShippingThreshold
      ? known({ rule: s.minOrderRule, amount: null })
      : unknown;
  }
  return known({ rule: s.minOrderRule, amount: s.minOrderAmount });
}

export function resolveFreeShippingThreshold(
  s: ResolvedStoreSettings,
): FactValue<number> {
  return s.freeShippingThreshold && s.freeShippingThreshold > 0
    ? known(s.freeShippingThreshold)
    : unknown;
}

export function resolveDeliveryEstimate(
  s: ResolvedStoreSettings,
): FactValue<string> {
  return s.deliveryEstimate?.trim() ? known(s.deliveryEstimate.trim()) : unknown;
}

// --- Los textos ------------------------------------------------------------

/** Pesos colombianos como los escribe una persona: «$120.000». */
export function formatCOP(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

/**
 * Lo que sale por WhatsApp. Mismo tono que los acuses de la etapa 1: cercano,
 * en corto, y cuando conviene una sugerencia —nunca un empujón—.
 *
 * Cambiar cualquiera de estos textos cambia `BUSINESS_FACT_TEMPLATES_VERSION`,
 * y eso deja sin efecto la aprobación de Paula hasta que los vuelva a aprobar.
 */
export const BUSINESS_FACT_TEMPLATES = {
  "business.hours": (hours: string) =>
    `Nuestro horario es ${hours} 💛 Escríbeme cuando quieras y te respondo apenas pueda.`,
  "business.city": (city: string) =>
    `Estamos en ${city} 💛 y enviamos a toda Colombia.`,
  "business.physical_store.yes": (address: string) =>
    `Sí, puedes visitarnos en ${address} 💛 Te esperamos.`,
  "business.physical_store.no": () =>
    `Por ahora solo vendemos en línea 💛 Te lo enviamos a donde estés, a toda Colombia.`,
  "business.min_order.none": () =>
    `No hay pedido mínimo 💛 Puedes llevar lo que quieras, así sea una sola cosita.`,
  "business.min_order.fixed": (amount: string) =>
    `El pedido mínimo es de ${amount} 💛 Si te falta poquito, te ayudo a completarlo con algo lindo.`,
  "business.min_order.match_shipping": (threshold: string) =>
    `No hay un mínimo estricto, pero te sugiero que tu pedido al menos cubra el envío 💛 Y si llegas a ${threshold}, el envío te sale gratis.`,
  "shipping.free_threshold": (threshold: string) =>
    `Desde ${threshold} el envío es gratis 💛 Si te falta poquito, te sugiero agregar algo más y te lo llevas sin pagar envío.`,
  "shipping.delivery_days": (estimate: string) =>
    `Tu pedido llega en ${estimate} 💛 Te paso el número de guía apenas lo despache.`,
} as const;

/**
 * Huella de los textos aprobados.
 *
 * Se calcula de lo que las clientas leen, no del archivo entero: reordenar o
 * comentar código no invalida el visto bueno, pero cambiar una palabra de una
 * respuesta sí. Es el mismo trato que `WhatsAppBotReply`, donde editar la
 * respuesta borra su `approvedAt`.
 */
export const BUSINESS_FACT_TEMPLATES_VERSION = createHash("sha256")
  .update(
    Object.entries(BUSINESS_FACT_TEMPLATES)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, render]) => `${key}:${(render as (v: never) => string)("«»" as never)}`)
      .join("\n"),
  )
  .digest("hex")
  .slice(0, 32);

/** Etiqueta de cada intención para la pantalla de aprobación. */
export const BUSINESS_FACT_LABELS: Record<BusinessFactIntent, string> = {
  "business.hours": "Horario de atención",
  "business.city": "En qué ciudad estamos",
  "business.physical_store": "Si hay tienda física",
  "business.min_order": "Pedido mínimo",
  "shipping.free_threshold": "Desde cuánto el envío es gratis",
  "shipping.delivery_days": "Cuánto tarda en llegar",
};

/**
 * Lo que Paula revisa antes de aprobar: cada texto con los datos REALES de su
 * tienda, no con ejemplos. Si un dato le falta, en vez del texto ve qué campo
 * tiene que llenar para que esa pregunta la conteste el bot.
 */
export function previewBusinessFacts(
  settings: ResolvedStoreSettings,
): { intent: BusinessFactIntent; label: string; text: string | null }[] {
  return (Object.keys(BUSINESS_FACT_LABELS) as BusinessFactIntent[]).map(
    (intent) => ({
      intent,
      label: BUSINESS_FACT_LABELS[intent],
      text: renderBusinessFact(intent, settings),
    }),
  );
}

export function areBusinessFactsApproved(s: {
  botFactsApprovedAt: Date | null;
  botFactsVersion: string | null;
}): boolean {
  return (
    s.botFactsApprovedAt !== null &&
    s.botFactsVersion === BUSINESS_FACT_TEMPLATES_VERSION
  );
}

// --- Unir las tres piezas --------------------------------------------------

/**
 * La respuesta para esa intención, o `null` si el dato no está guardado. Un
 * `null` NO es un error: significa que Paula todavía no ha llenado ese campo,
 * y quien llama sigue con el camino de siempre hasta escalarle a ella.
 */
export function renderBusinessFact(
  intent: BusinessFactIntent,
  settings: ResolvedStoreSettings,
): string | null {
  const t = BUSINESS_FACT_TEMPLATES;

  switch (intent) {
    case "business.hours": {
      const fact = resolveHours(settings);
      return fact.known ? t["business.hours"](fact.value) : null;
    }
    case "business.city": {
      const fact = resolveCity(settings);
      return fact.known ? t["business.city"](fact.value) : null;
    }
    case "business.physical_store": {
      const fact = resolvePhysicalStore(settings);
      if (!fact.known) return null;
      return fact.value.has
        ? t["business.physical_store.yes"](fact.value.address!)
        : t["business.physical_store.no"]();
    }
    case "business.min_order": {
      const fact = resolveMinOrder(settings);
      if (!fact.known) return null;
      if (fact.value.rule === MinimumOrderRule.NONE) {
        return t["business.min_order.none"]();
      }
      if (fact.value.rule === MinimumOrderRule.FIXED) {
        return t["business.min_order.fixed"](formatCOP(fact.value.amount!));
      }
      return t["business.min_order.match_shipping"](
        formatCOP(settings.freeShippingThreshold!),
      );
    }
    case "shipping.free_threshold": {
      const fact = resolveFreeShippingThreshold(settings);
      return fact.known ? t["shipping.free_threshold"](formatCOP(fact.value)) : null;
    }
    case "shipping.delivery_days": {
      const fact = resolveDeliveryEstimate(settings);
      return fact.known ? t["shipping.delivery_days"](fact.value) : null;
    }
  }
}
