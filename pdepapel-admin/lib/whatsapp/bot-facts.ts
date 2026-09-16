import { createHash } from "node:crypto";

import { MinimumOrderRule } from "@prisma/client";

import { formatOpeningHours, type ResolvedStoreSettings } from "@/lib/store-settings";
import { normalizeBotText } from "@/lib/whatsapp/bot-matching";
import {
  TALK_TO_OWNER_BUTTON_TITLE,
  buildPaymentRowId,
  readPaymentTarget,
} from "@/lib/whatsapp/bot-replies";
import type { WhatsAppListRow } from "@/lib/whatsapp/send";

/**
 * Datos del negocio por WhatsApp.
 *
 * Siete preguntas que la gente hace todo el rato y que tienen UNA respuesta
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
  | "shipping.delivery_days"
  | "payment.methods";

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
    "donde estan", "de donde escriben",
  ],
  "business.physical_store": [
    "tienda fisica", "local fisico", "puedo ir a", "tienen local",
    "se puede recoger", "recoger en tienda", "tienen punto de venta",
    "cual es la direccion", "puedo pasar a",
    // «punto físico» es como lo dijo una clienta de verdad el 2026-09-15, y no
    // estaba: la pregunta acabó sin respuesta. «punto de venta» y «punto
    // fisico» van sueltos —sin el «tienen» delante— porque se preguntan de
    // muchas formas y el punto es lo que identifica la pregunta.
    "punto fisico", "punto de venta", "puedo recoger", "atienden al publico",
    "tienen direccion", "donde los encuentro",
  ],
  "business.min_order": [
    "pedido minimo", "compra minima", "monto minimo", "minimo de compra",
    "hay un minimo", "cuanto es lo minimo", "hay minimo", "minimo para pedir",
  ],
  "shipping.free_threshold": [
    "envio gratis", "envios gratis", "gratis el envio", "para que salga gratis",
    "desde cuanto es gratis", "cuanto para envio gratis",
  ],
  "shipping.delivery_days": [
    "cuanto se demora", "cuanto tarda", "cuantos dias", "en cuanto llega",
    "cuando llega", "cuanto demora el envio", "tiempo de entrega",
    "cuanto se tarda en llegar", "cuanto tardan", "en cuantos dias",
    "cuanto se demoran",
  ],
  // Ojo con las frases sueltas: «pago» a secas también aparece en «cuándo
  // llega mi pago», así que se piden formas completas. «nequi» y «daviplata»
  // sí van solas porque nombran justo esto y nada más.
  "payment.methods": [
    "metodos de pago", "medios de pago", "formas de pago", "forma de pago",
    "como pago", "como puedo pagar", "como te pago", "como hago el pago",
    "donde pago", "donde consigno", "numero de cuenta", "cuenta bancaria",
    "datos bancarios", "a que cuenta", "nequi", "daviplata", "bancolombia",
    "aceptan transferencia", "puedo transferir", "como se paga",
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

// --- Las formas de pago, que son un menú y no un texto --------------------

/**
 * Cada opción que se puede tocar. Las tres primeras son el menú de arriba;
 * las tres últimas salen al tocar «Transferencia».
 */
export type PaymentOption =
  | "efectivo"
  | "transferencia"
  | "datafono"
  | "bancolombia"
  | "nequi"
  | "daviplata";

/** El QR de Bancolombia, servido por la tienda. Meta solo acepta JPEG o PNG. */
export const BANCOLOMBIA_QR_URL =
  "https://papeleriapdepapel.com/images/qr-bre-b.jpeg";

const PAYMENT_TITLES: Record<PaymentOption, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  datafono: "Datáfono",
  bancolombia: "Bancolombia",
  nequi: "Nequi",
  daviplata: "Daviplata",
};

/** El dato guardado de cada opción, o vacío si no se ofrece. */
function paymentValue(
  option: PaymentOption,
  s: ResolvedStoreSettings,
): string | null {
  switch (option) {
    case "efectivo":
      return s.paymentCashInfo?.trim() || null;
    case "datafono":
      return s.paymentCardInfo?.trim() || null;
    case "bancolombia":
      return s.paymentBancolombiaAccount?.trim() || null;
    case "nequi":
      return s.paymentNequiNumber?.trim() || null;
    case "daviplata":
      return s.paymentDaviplataNumber?.trim() || null;
    // No tiene dato propio: es la puerta a las tres cuentas.
    case "transferencia":
      return hasAnyTransfer(s) ? "-" : null;
  }
}

/** El mismo orden en que Paula las manda hoy a mano. */
const TRANSFER_OPTIONS: PaymentOption[] = ["bancolombia", "daviplata", "nequi"];

function hasAnyTransfer(s: ResolvedStoreSettings): boolean {
  return TRANSFER_OPTIONS.some((option) => Boolean(paymentValue(option, s)));
}

const row = (option: PaymentOption): WhatsAppListRow => ({
  id: buildPaymentRowId(option),
  title: PAYMENT_TITLES[option],
});

/** Solo las que se pueden contestar: una opción sin dato no se enseña. */
export function buildPaymentMenuRows(s: ResolvedStoreSettings): WhatsAppListRow[] {
  return (["efectivo", "transferencia", "datafono"] as PaymentOption[])
    .filter((option) => Boolean(paymentValue(option, s)))
    .map(row);
}

/** Las tres cuentas, con el mismo criterio. */
export function buildTransferMenuRows(s: ResolvedStoreSettings): WhatsAppListRow[] {
  return TRANSFER_OPTIONS.filter((option) => Boolean(paymentValue(option, s))).map(row);
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
    `Estamos en ${city} 💛 y hacemos envíos a toda Colombia.`,
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
  // Los menús llevan 💛; las respuestas de plata no, son las palabras de Paula.
  "payment.menu": () => `¿Cómo prefieres pagar? 💛`,
  "payment.transfer.menu": () => `¿A cuál te queda mejor? 💛`,

  "payment.cash": (info: string) => `En efectivo, claro.\n${info}`,
  "payment.card": (info: string) => `Sí, tenemos datáfono.\n${info}`,
  "payment.bancolombia": (account: string) =>
    `Bancolombia\n${account}\nTambién puedes pagar escaneando el QR de la foto.\nCuando realices el pago, me envías el comprobante, por favor 🤗`,
  "payment.nequi": (number: string) =>
    `Nequi\n${number}\nCuando realices el pago, me envías el comprobante, por favor 🤗`,
  "payment.daviplata": (number: string) =>
    `Daviplata\n${number}\nCuando realices el pago, me envías el comprobante, por favor 🤗`,
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

/** `null` si esa opción se vació entre que se enseñó el menú y el toque. */
export function renderPaymentOption(
  option: PaymentOption,
  s: ResolvedStoreSettings,
): { text: string; photo?: string; rows?: WhatsAppListRow[] } | null {
  const t = BUSINESS_FACT_TEMPLATES;
  const value = paymentValue(option, s);
  if (!value) return null;

  switch (option) {
    case "transferencia": {
      const rows = buildTransferMenuRows(s);
      return rows.length > 0 ? { text: t["payment.transfer.menu"](), rows } : null;
    }
    case "efectivo":
      return { text: t["payment.cash"](value) };
    case "datafono":
      return { text: t["payment.card"](value) };
    case "bancolombia":
      // La foto es el QR: quien prefiera escanear no tiene que teclear nada.
      return { text: t["payment.bancolombia"](value), photo: BANCOLOMBIA_QR_URL };
    case "nequi":
      return { text: t["payment.nequi"](value) };
    case "daviplata":
      return { text: t["payment.daviplata"](value) };
  }
}

/** Lee «efectivo», «bancolombia»… de lo que vino en la fila tocada. */
export function parsePaymentOption(value: string | null): PaymentOption | null {
  const options: PaymentOption[] = [
    "efectivo", "transferencia", "datafono", "bancolombia", "nequi", "daviplata",
  ];
  return options.find((option) => option === value) ?? null;
}

/** Etiqueta de cada intención para la pantalla de aprobación. */
export const BUSINESS_FACT_LABELS: Record<BusinessFactIntent, string> = {
  "business.hours": "Horario de atención",
  "business.city": "En qué ciudad estamos",
  "business.physical_store": "Si hay tienda física",
  "business.min_order": "Pedido mínimo",
  "shipping.free_threshold": "Desde cuánto el envío es gratis",
  "shipping.delivery_days": "Cuánto tarda en llegar",
  "payment.methods": "Cómo se paga (menú)",
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
      text:
        intent === "payment.methods"
          ? previewPaymentFlow(settings)
          : renderBusinessFact(intent, settings),
    }),
  );
}

/**
 * El menú de pagos son hasta seis mensajes según lo que se toque: se dibuja el
 * recorrido entero para que Paula no apruebe a ciegas lo que no puede leer.
 */
function previewPaymentFlow(s: ResolvedStoreSettings): string | null {
  const menu = buildPaymentMenuRows(s);
  if (menu.length === 0) return null;

  const partes: string[] = [
    BUSINESS_FACT_TEMPLATES["payment.menu"](),
    menu.map((r) => `   ▸ ${r.title}`).join("\n") + `\n   ▸ ${TALK_TO_OWNER_BUTTON_TITLE}`,
  ];

  for (const fila of menu) {
    const option = parsePaymentOption(readPaymentTarget(fila.id));
    if (!option) continue;
    const hoja = renderPaymentOption(option, s);
    if (!hoja) continue;

    partes.push(`\n── Si toca «${fila.title}» ──`);
    partes.push(hoja.photo ? `${hoja.text}\n   (va con la foto del QR)` : hoja.text);

    // «Transferencia» no contesta: abre otro menú, y detrás hay tres respuestas
    // más que también hay que poder leer.
    for (const sub of hoja.rows ?? []) {
      const subOption = parsePaymentOption(readPaymentTarget(sub.id));
      const subHoja = subOption ? renderPaymentOption(subOption, s) : null;
      if (!subHoja) continue;
      partes.push(`\n   ── …y luego «${sub.title}» ──`);
      partes.push(
        subHoja.photo ? `${subHoja.text}\n   (va con la foto del QR)` : subHoja.text,
      );
    }
  }

  return partes.join("\n");
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
    case "payment.methods": {
      // Aquí solo sale el texto que acompaña al menú; las opciones las arma
      // `buildPaymentMenuRows`. Sin ninguna opción con dato no se contesta,
      // igual que cualquier otro dato del negocio sin llenar.
      return buildPaymentMenuRows(settings).length > 0 ? t["payment.menu"]() : null;
    }
  }
}
