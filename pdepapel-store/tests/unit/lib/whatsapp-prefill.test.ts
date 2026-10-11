import { describe, expect, it } from "vitest";

import {
  WHATSAPP_PREFILL_MAX_LENGTH,
  buildWhatsAppPrefillText,
  buildWhatsAppUrl,
  truncateName,
  whatsAppAnalyticsParams,
} from "@/lib/whatsapp-prefill";

/**
 * Los textos que el bot del panel reconoce (pdepapel-admin/lib/whatsapp/web-origin.ts).
 * Si cambian aquí, cambian allá en el mismo despliegue.
 */
describe("buildWhatsAppPrefillText", () => {
  it("producto: nombre y referencia", () => {
    expect(buildWhatsAppPrefillText({ pageType: "product", productName: "Cuaderno Argollado Norma 5 Materias", productRef: "CUA-NOR-5MA-GR-X-0123" })).toBe(
      "¡Hola! 👋 Vengo de la tienda web y me interesa: Cuaderno Argollado Norma 5 Materias (ref CUA-NOR-5MA-GR-X-0123).",
    );
  });

  it("un nombre larguísimo se corta por palabras y el texto no pasa del tope", () => {
    const text = buildWhatsAppPrefillText({ pageType: "product", productName: "Set ".repeat(80), productRef: "SET-AAA-BBB-CC-D-0001" });
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_PREFILL_MAX_LENGTH);
    expect(text).toMatch(/Set…? \(ref SET-AAA-BBB-CC-D-0001\)\.$/);
    expect(truncateName("Cuaderno argollado grande de pasta dura", 20)).toBe("Cuaderno argollado…");
  });

  it("carrito: hasta 5 referencias y luego «y más», sin repetir", () => {
    const refs = ["A-1", "B-2", "C-3", "D-4", "E-5", "F-6", "A-1"];
    expect(buildWhatsAppPrefillText({ pageType: "cart", productRefs: refs })).toBe(
      "¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito (ref A-1, B-2, C-3, D-4, E-5 y más).",
    );
    expect(buildWhatsAppPrefillText({ pageType: "cart", productRefs: [] })).toBe("¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito.");
  });

  it("pedido y general", () => {
    expect(buildWhatsAppPrefillText({ pageType: "order", orderNumber: "ORD-1700000000000-123" })).toBe(
      "¡Hola! 👋 Tengo una pregunta sobre mi pedido #ORD-1700000000000-123 de la tienda web.",
    );
    expect(buildWhatsAppPrefillText({ pageType: "general" })).toBe("¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta.");
  });

  it("todos caben en el tope", () => {
    const cart = buildWhatsAppPrefillText({ pageType: "cart", productRefs: Array.from({ length: 9 }, (_, i) => `AAA-BBB-CCC-DD-E-000${i}`) });
    expect(cart.length).toBeLessThanOrEqual(WHATSAPP_PREFILL_MAX_LENGTH);
  });
});

describe("buildWhatsAppUrl", () => {
  it("va al número de la tienda con el texto codificado", () => {
    const url = buildWhatsAppUrl({ pageType: "general" });
    expect(url.startsWith("https://wa.me/573132582293?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1])).toBe("¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta.");
  });
});

describe("whatsAppAnalyticsParams", () => {
  it("solo el tipo de página y la referencia del producto", () => {
    expect(whatsAppAnalyticsParams({ pageType: "product", productName: "Cuaderno", productRef: "CUA-1" })).toEqual({ page_type: "product", product_ref: "CUA-1" });
    expect(whatsAppAnalyticsParams({ pageType: "order", orderNumber: "ORD-1" })).toEqual({ page_type: "order", product_ref: null });
  });
});
