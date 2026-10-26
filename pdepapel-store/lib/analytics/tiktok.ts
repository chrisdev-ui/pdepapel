import { hasMarketingConsent } from "@/lib/analytics-consent";
import type { AnalyticsItem } from "@/lib/customer-analytics";

/**
 * Píxel de TikTok: solo con el permiso de «Publicidad» y solo si existe
 * NEXT_PUBLIC_TIKTOK_PIXEL_ID. Sin nombre, correo, teléfono, dirección ni
 * documento: los eventos llevan la referencia del producto (la misma `id` de
 * los feeds de Meta y Google: `sku || id`), su nombre, cantidad, precio y el
 * valor. Sin `ttq.identify` ni coincidencia avanzada.
 */

type TikTokMethod = (...arguments_: unknown[]) => void;

interface TikTokQueue extends Array<unknown> {
  methods: string[];
  setAndDefer: (target: TikTokQueue, method: string) => void;
  instance: (id: string) => unknown;
  load: (id: string, options?: Record<string, unknown>) => void;
  page: TikTokMethod;
  track: TikTokMethod;
  holdConsent: TikTokMethod;
  grantConsent: TikTokMethod;
  revokeConsent: TikTokMethod;
  _i?: Record<string, unknown>;
  _t?: Record<string, number>;
  _o?: Record<string, unknown>;
}

declare global {
  interface Window {
    ttq?: TikTokQueue;
    TiktokAnalyticsObject?: string;
  }
}

export type TikTokEventName =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "CompletePayment"
  | "Search";

export interface TikTokContent {
  content_id: string;
  content_type: "product";
  content_name: string;
  quantity: number;
  price: number;
}

/** Lo único que puede salir en un evento: nada más pasa el filtro. */
export interface TikTokEventParameters {
  contents?: TikTokContent[];
  content_type?: "product";
  value?: number;
  currency?: "COP";
  query?: string;
}

const SDK_URL = "https://analytics.tiktok.com/i18n/pixel/events.js";
const METHODS = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
const MAX_QUEUED_EVENTS = 40;

let loadedPixelId: string | null = null;
let pending: Array<{ name: TikTokEventName; parameters: TikTokEventParameters; eventId: string }> = [];

export function tiktokPixelId(): string | undefined {
  const id = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID?.trim();
  return id ? id : undefined;
}

function canSend(): boolean {
  return typeof window !== "undefined" && Boolean(tiktokPixelId()) && hasMarketingConsent();
}

/** La cola oficial de TikTok (su código base), escrita aquí para no incrustar un script con el ID. */
function installQueue(): TikTokQueue {
  window.TiktokAnalyticsObject = "ttq";
  const ttq = (window.ttq ||= [] as unknown as TikTokQueue);
  ttq.methods = METHODS;
  ttq.setAndDefer = (target, method) => {
    (target as unknown as Record<string, TikTokMethod>)[method] = (...arguments_: unknown[]) => {
      target.push([method, ...arguments_]);
    };
  };
  for (const method of METHODS) ttq.setAndDefer(ttq, method);
  ttq.instance = (id) => {
    const instance = ((ttq._i ||= {})[id] ||= []) as TikTokQueue;
    for (const method of METHODS) ttq.setAndDefer(instance, method);
    return instance;
  };
  ttq.load = (id, options) => {
    ttq._i ||= {};
    ttq._i[id] = Object.assign([], { _u: SDK_URL });
    ttq._t ||= {};
    ttq._t[id] = Date.now();
    ttq._o ||= {};
    ttq._o[id] = options ?? {};
    const script = document.createElement("script");
    script.id = "pdepapel-tiktok-pixel";
    script.async = true;
    script.src = `${SDK_URL}?sdkid=${encodeURIComponent(id)}&lib=ttq`;
    document.head.appendChild(script);
  };
  return ttq;
}

/**
 * Carga el píxel una sola vez, solo con permiso. Arranca retenido
 * (`holdConsent`) y se libera enseguida (`grantConsent`): el permiso ya se dio.
 * La primera vista de página la manda aquí; las navegaciones siguientes, el
 * proveedor con `trackTikTokPage`.
 */
export function loadTikTokPixel(): boolean {
  const id = tiktokPixelId();
  if (!canSend() || !id) return false;
  if (loadedPixelId === id && window.ttq) return true;

  const ttq = installQueue();
  ttq.holdConsent();
  ttq.load(id);
  ttq.grantConsent();
  ttq.page();
  loadedPixelId = id;

  const queued = pending;
  pending = [];
  for (const { name, parameters, eventId } of queued) ttq.track(name, parameters, { event_id: eventId });
  return true;
}

/** Al retirar «Publicidad»: TikTok deja de enviar y nada queda esperando. La página se recarga después. */
export function revokeTikTokConsent(): void {
  pending = [];
  if (typeof window === "undefined") return;
  window.ttq?.revokeConsent?.();
}

export function isTikTokPixelLoaded(): boolean {
  return loadedPixelId !== null;
}

export function trackTikTokPage(): void {
  if (!canSend() || !loadedPixelId) return;
  window.ttq?.page();
}

/** Identificador del evento para que la futura API de eventos de TikTok no lo cuente dos veces. */
export function newTikTokEventId(name: TikTokEventName, key?: string): string {
  if (key) return `${name}-${key}`;
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${name}-${random}`;
}

export function toTikTokContents(items: AnalyticsItem[]): TikTokContent[] {
  return items.map((item) => ({
    content_id: item.item_id,
    content_type: "product",
    content_name: item.item_name,
    quantity: item.quantity ?? 1,
    price: item.price,
  }));
}

export function tiktokProductParameters(items: AnalyticsItem[]): TikTokEventParameters {
  const contents = toTikTokContents(items);
  return {
    contents,
    content_type: "product",
    value: contents.reduce((total, content) => total + content.price * content.quantity, 0),
    currency: "COP",
  };
}

/** Manda un evento si hay permiso; si el píxel aún no cargó, espera en una cola corta. Devuelve el `event_id` o null. */
export function trackTikTokEvent(name: TikTokEventName, parameters: TikTokEventParameters, options: { key?: string } = {}): string | null {
  if (!canSend()) return null;
  const eventId = newTikTokEventId(name, options.key);
  if (loadedPixelId && window.ttq) {
    window.ttq.track(name, parameters, { event_id: eventId });
  } else if (pending.length < MAX_QUEUED_EVENTS) {
    pending.push({ name, parameters, eventId });
  }
  return eventId;
}

const PAID_ONLINE_METHODS = new Set(["Bold", "Wompi", "PayU", "GiftCard"]);

export interface CompletePaymentOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  payment?: { method?: string | null } | null;
}

/**
 * Compra confirmada: el pedido está PAID y lo cobró una pasarela (o lo cubrió
 * entero una tarjeta de regalo). Nunca una transferencia ni contra entrega.
 */
export function isTikTokCompletePayment(order: CompletePaymentOrder): boolean {
  return order.status === "PAID" && PAID_ONLINE_METHODS.has(order.payment?.method ?? "");
}

const completePaymentKey = (orderId: string) => `pdepapel:tiktok-complete-payment:${orderId}`;

/** Una vez por pedido en este navegador (las recargas y el sondeo no lo repiten); el número de pedido va solo en el `event_id`. */
export function trackTikTokCompletePayment(order: CompletePaymentOrder, items: AnalyticsItem[]): boolean {
  if (!isTikTokCompletePayment(order) || !canSend()) return false;
  try {
    if (window.localStorage.getItem(completePaymentKey(order.id))) return false;
  } catch {
    // Sin almacenamiento se manda igual: el event_id lo deduplica en TikTok.
  }
  const parameters = { ...tiktokProductParameters(items), value: Number(order.total) };
  const eventId = trackTikTokEvent("CompletePayment", parameters, { key: order.orderNumber });
  if (!eventId) return false;
  try {
    window.localStorage.setItem(completePaymentKey(order.id), "1");
  } catch {
    // Igual que arriba.
  }
  return true;
}

/** Solo para las pruebas. */
export function resetTikTokPixelForTests(): void {
  loadedPixelId = null;
  pending = [];
}
