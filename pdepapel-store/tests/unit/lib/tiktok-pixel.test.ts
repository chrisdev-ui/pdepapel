// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ANALYTICS_CONSENT_STORAGE_KEY } from "@/lib/analytics-consent";
import {
  isTikTokCompletePayment,
  loadTikTokPixel,
  resetTikTokPixelForTests,
  revokeTikTokConsent,
  tiktokProductParameters,
  trackTikTokCompletePayment,
  trackTikTokEvent,
  trackTikTokPage,
} from "@/lib/analytics/tiktok";
import { toAnalyticsItem } from "@/lib/customer-analytics";
import type { Product } from "@/types";

const product = {
  id: "prod-uuid-1",
  sku: "LIB-KAW-ROS-M-1234",
  name: "Libreta kawaii rosa",
  price: "12000",
  category: { name: "Libretas" },
} as unknown as Product;

const ALLOWED_PARAMETERS = new Set(["contents", "content_type", "value", "currency", "query"]);
const ALLOWED_CONTENT = new Set(["content_id", "content_type", "content_name", "quantity", "price"]);
const PII = /@|\+?57\d{10}|\b3\d{9}\b|calle|carrera|cra\.?|#\s?\d|documento|cédula/i;

function setConsent(marketing: boolean) {
  window.localStorage.setItem(
    ANALYTICS_CONSENT_STORAGE_KEY,
    JSON.stringify({ analytics: false, marketing, updatedAt: "2026-10-26T00:00:00.000Z" }),
  );
}

/** Lo que el píxel recibió por la cola (antes de que cargue el SDK real). */
function calls(method?: string) {
  const queue = (window.ttq ?? []) as unknown as unknown[][];
  return queue.filter((entry) => Array.isArray(entry) && (!method || entry[0] === method));
}

describe("píxel de TikTok", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.head.innerHTML = "";
    delete window.ttq;
    resetTikTokPixelForTests();
    vi.stubEnv("NEXT_PUBLIC_TIKTOK_PIXEL_ID", "TESTPIXEL123");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin la variable no carga ni manda nada, aunque haya permiso", () => {
    vi.stubEnv("NEXT_PUBLIC_TIKTOK_PIXEL_ID", "");
    setConsent(true);
    expect(loadTikTokPixel()).toBe(false);
    expect(trackTikTokEvent("ViewContent", tiktokProductParameters([toAnalyticsItem(product, 1)]))).toBeNull();
    expect(window.ttq).toBeUndefined();
    expect(document.querySelector("script")).toBeNull();
  });

  it("sin «Publicidad» no carga ni manda nada", () => {
    setConsent(false);
    expect(loadTikTokPixel()).toBe(false);
    expect(trackTikTokEvent("AddToCart", tiktokProductParameters([toAnalyticsItem(product, 1)]))).toBeNull();
    expect(window.ttq).toBeUndefined();
    expect(document.querySelector("script")).toBeNull();
  });

  it("con permiso: retiene, carga el SDK con el ID, libera, manda la primera vista y suelta lo que esperaba", () => {
    setConsent(true);
    const eventId = trackTikTokEvent("ViewContent", tiktokProductParameters([toAnalyticsItem(product, 1)]));
    expect(eventId).toMatch(/^ViewContent-/);

    expect(loadTikTokPixel()).toBe(true);
    const order = calls().map((entry) => entry[0]);
    expect(order.slice(0, 3)).toEqual(["holdConsent", "grantConsent", "page"]);
    expect(calls("track")).toHaveLength(1);
    expect(calls("track")[0][3]).toEqual({ event_id: eventId });
    const script = document.querySelector<HTMLScriptElement>("script#pdepapel-tiktok-pixel");
    expect(script?.src).toBe("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=TESTPIXEL123&lib=ttq");

    // Cargar dos veces no duplica nada.
    expect(loadTikTokPixel()).toBe(true);
    expect(document.querySelectorAll("script#pdepapel-tiktok-pixel")).toHaveLength(1);
    expect(calls("page")).toHaveLength(1);
    trackTikTokPage();
    expect(calls("page")).toHaveLength(2);
  });

  it("la referencia es la misma de los feeds (sku || id) y el evento solo lleva campos permitidos, sin datos personales", () => {
    setConsent(true);
    loadTikTokPixel();
    trackTikTokEvent("AddToCart", tiktokProductParameters([toAnalyticsItem(product, 2)]));
    const [, name, parameters, options] = calls("track")[0] as [string, string, Record<string, unknown>, { event_id: string }];
    expect(name).toBe("AddToCart");
    expect(Object.keys(parameters).every((key) => ALLOWED_PARAMETERS.has(key))).toBe(true);
    const contents = parameters.contents as Record<string, unknown>[];
    expect(contents[0]).toEqual({ content_id: "LIB-KAW-ROS-M-1234", content_type: "product", content_name: "Libreta kawaii rosa", quantity: 2, price: 12000 });
    expect(contents.every((content) => Object.keys(content).every((key) => ALLOWED_CONTENT.has(key)))).toBe(true);
    expect(parameters).toMatchObject({ value: 24000, currency: "COP", content_type: "product" });
    expect(JSON.stringify(parameters)).not.toMatch(PII);
    expect(options.event_id).toMatch(/^AddToCart-/);
    // Sin sku, la referencia es el id, igual que en el feed.
    expect(tiktokProductParameters([toAnalyticsItem({ ...product, sku: "" } as Product, 1)]).contents?.[0].content_id).toBe("prod-uuid-1");
  });

  it("retirar «Publicidad» llama a revokeConsent y no suelta lo que esperaba", () => {
    setConsent(true);
    trackTikTokEvent("Search", { query: "libreta" });
    revokeTikTokConsent();
    setConsent(false);
    expect(loadTikTokPixel()).toBe(false);
    setConsent(true);
    loadTikTokPixel();
    expect(calls("track")).toHaveLength(0);
  });

  describe("CompletePayment", () => {
    const items = [toAnalyticsItem(product, 1)];
    const order = (overrides: Partial<{ status: string; method: string }> = {}) => ({
      id: "order-uuid-1",
      orderNumber: "ORD-1792999999999-123",
      status: overrides.status ?? "PAID",
      total: 15000,
      payment: { method: overrides.method ?? "Bold" },
    });

    it("solo pagado por pasarela o por tarjeta de regalo; nunca transferencia, contra entrega ni pendiente", () => {
      expect(isTikTokCompletePayment(order())).toBe(true);
      expect(isTikTokCompletePayment(order({ method: "Wompi" }))).toBe(true);
      expect(isTikTokCompletePayment(order({ method: "GiftCard" }))).toBe(true);
      expect(isTikTokCompletePayment(order({ method: "BankTransfer" }))).toBe(false);
      expect(isTikTokCompletePayment(order({ method: "COD" }))).toBe(false);
      expect(isTikTokCompletePayment(order({ status: "PENDING" }))).toBe(false);
      expect(isTikTokCompletePayment(order({ status: "PENDING", method: "BankTransfer" }))).toBe(false);
    });

    it("una vez por pedido: la recarga no lo repite; el número de pedido va solo en el event_id", () => {
      setConsent(true);
      loadTikTokPixel();
      expect(trackTikTokCompletePayment(order(), items)).toBe(true);
      expect(trackTikTokCompletePayment(order(), items)).toBe(false);
      const tracks = calls("track");
      expect(tracks).toHaveLength(1);
      const [, name, parameters, options] = tracks[0] as [string, string, Record<string, unknown>, { event_id: string }];
      expect(name).toBe("CompletePayment");
      expect(options).toEqual({ event_id: "CompletePayment-ORD-1792999999999-123" });
      expect(parameters).toMatchObject({ value: 15000, currency: "COP" });
      expect(JSON.stringify(parameters)).not.toContain("ORD-");
    });

    it("sin permiso no se manda ni se marca: si después acepta, sí sale", () => {
      setConsent(false);
      expect(trackTikTokCompletePayment(order(), items)).toBe(false);
      setConsent(true);
      loadTikTokPixel();
      expect(trackTikTokCompletePayment(order(), items)).toBe(true);
    });

    it("transferencia pagada tampoco cuenta (regla aprobada)", () => {
      setConsent(true);
      loadTikTokPixel();
      expect(trackTikTokCompletePayment(order({ method: "BankTransfer" }), items)).toBe(false);
      expect(calls("track")).toHaveLength(0);
    });
  });
});
