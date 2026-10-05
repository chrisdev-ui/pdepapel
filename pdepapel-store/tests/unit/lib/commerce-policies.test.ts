import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BUSINESS_DAYS,
  HANDLING_DAYS,
  MERCHANT_RETURN_DAYS,
  ORDER_CUTOFF_TIME,
  RETURN_WINDOW_DAYS,
  STANDARD_SHIPPING_RATE,
  TRANSIT_DAYS,
  buildMerchantReturnPolicy,
  buildOrganizationShippingService,
  buildShippingDetails,
} from "@/lib/commerce-policies";
import { buildProductJsonLd, buildProductSchema } from "@/lib/product-schema";
import type { Product } from "@/types";

const page = (path: string) =>
  readFileSync(join(__dirname, "../../../app/(routes)/politicas", path, "page.tsx"), "utf8");
const source = (path: string) => readFileSync(join(__dirname, "../../..", path), "utf8");
/** Todos los .ts/.tsx bajo una carpeta. */
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
  );
/** El texto tal como se lee: sin los saltos de línea del JSX. */
const flat = (text: string) => text.replace(/\s+/g, " ");

const base = {
  id: "p1",
  slug: "agenda",
  name: "Agenda",
  description: "<p>Agenda</p>",
  price: "30000",
  stock: 3,
  sku: "AG-1",
  images: [],
  reviews: [],
} as unknown as Product;

/**
 * El marcado no puede prometer otra cosa que las páginas de políticas:
 * Merchant compara y suspende fichas cuando no coinciden.
 */
describe("commerce policies match the published policy pages", () => {
  it("uses the return window published on /politicas/devoluciones", () => {
    const returns = page("devoluciones");
    expect(flat(returns)).toContain(`cinco (${RETURN_WINDOW_DAYS}) días hábiles contados desde la entrega`);
    expect(returns).toContain(`${RETURN_WINDOW_DAYS} días hábiles`);
    // El cliente paga el envío cuando la devolución es por decisión suya.
    expect(returns).toMatch(/costos de envío corren por tu cuenta/);
    // Y lo asumimos nosotros si es por un error nuestro o un defecto.
    expect(flat(returns)).toMatch(/error nuestro .* asumimos todos los costos/);
    // El marcado declara una semana (7 días calendario): nunca menos que los
    // cinco días hábiles de una semana sin festivos.
    expect(MERCHANT_RETURN_DAYS).toBe(7);
    expect(MERCHANT_RETURN_DAYS).toBeGreaterThanOrEqual(RETURN_WINDOW_DAYS + 2);
  });

  /**
   * Desde el 2026-10-05 la ventana es de cinco días hábiles contados desde la
   * entrega (el mínimo del retracto, Ley 1480 art. 47). Ningún texto de la
   * tienda puede volver a contarlos desde la compra.
   */
  it("counts the return window from delivery everywhere it is stated", () => {
    expect(page("devoluciones")).toContain("contados desde la entrega para avisarnos");
    for (const file of [
      "app/(routes)/politicas/devoluciones/page.tsx",
      "components/product-signals.tsx",
      "components/product-details-accordion.tsx",
    ]) {
      expect(flat(source(file)), file).toContain("cinco (5) días hábiles contados desde la entrega");
    }
    for (const file of [
      "app/(routes)/politicas/devoluciones/page.tsx",
      "components/product-signals.tsx",
      "components/product-details-accordion.tsx",
      "app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx",
      "app/(routes)/pedido/[orderId]/components/order-help-card.tsx",
    ]) {
      const text = flat(source(file));
      expect(text, file).not.toMatch(/(desde|después de|fecha de) (la )?compra/);
      expect(text, file).toMatch(/(entrega|recibir)/);
    }
  });

  /**
   * Los textos que repiten la ventana fuera de la página de políticas: la
   * meta de la página, la ayuda del pedido y el checkout.
   */
  it("states the five business days in every short copy of the window", () => {
    expect(source("app/(routes)/politicas/devoluciones/page.tsx")).toContain(
      "cinco (5) días hábiles contados desde la entrega, condiciones del producto",
    );
    expect(source("app/(routes)/pedido/[orderId]/components/order-help-card.tsx")).toContain(
      "Cinco (5) días hábiles contados desde la entrega",
    );
    expect(flat(source("app/(routes)/finalizar-compra/components/multi-step-checkout-form.tsx"))).toContain(
      "Cambios hasta cinco (5) días hábiles contados desde la entrega.",
    );
  });

  /**
   * Guardia: el plazo de cambios es de días HÁBILES (Ley 1480, art. 47).
   * Falla si cualquier texto de la tienda vuelve a hablar de «días calendario»
   * cerca de cambios, devoluciones o retracto.
   */
  it("never states the return window in calendar days", () => {
    const files = [...walk(join(__dirname, "../../../app")), ...walk(join(__dirname, "../../../components"))];
    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!/d[ií]as calendario/i.test(line)) return;
        // El reembolso del retracto sí es en días calendario (art. 47).
        if (/quince \(15\) d[ií]as calendario/i.test(line)) return;
        const around = lines.slice(Math.max(0, index - 3), index + 4).join(" ");
        if (/cambio|devoluci|retract|recib|entrega/i.test(around)) offenders.push(`${relative(join(__dirname, "../../.."), file)}:${index + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  /**
   * Retracto (Ley 1480, art. 47, comercio electrónico): el dinero vuelve por
   * el mismo medio de pago o uno acordado en máximo 15 días calendario; el
   * saldo a favor solo si la clienta lo elige.
   */
  it("refunds a retraction to the payment method within fifteen calendar days", () => {
    const text = flat(page("devoluciones"));
    expect(text).toContain("te devolvemos el dinero por el mismo medio de pago, o por el que acordemos contigo, en máximo quince (15) días calendario");
    expect(text).toContain("Si lo prefieres, el valor puede quedar como saldo a favor");
    expect(text).not.toContain("el valor queda como saldo a favor para usar");
  });

  /** Mismo día si se paga antes de las 12:00, de lunes a viernes; si no, el siguiente día hábil. */
  it("states the same handling rule the markup declares", () => {
    const shipping = flat(page("envios"));
    expect(shipping).toContain("el mismo día si el pago se confirma antes de las 12:00 m. (hora de Colombia), de lunes a viernes; si no, el siguiente día hábil");
    expect(shipping).not.toContain("después de confirmar el pago");
    expect(shipping).not.toContain("sábado");
    expect(flat(source("components/product-details-accordion.tsx"))).toContain("antes de las 12:00 m. (lunes a viernes), el pedido sale el mismo día");
    expect(flat(source("components/home/hero.tsx"))).not.toContain("1 a 2 días hábiles");
    expect(HANDLING_DAYS).toEqual({ min: 0, max: 1 });
  });

  /**
   * Desde el 2026-10-05 la tarifa y el tránsito del marcado salen de la
   * política de envío de Merchant Center (§9.13.2), que manda sobre el
   * marcado. La página de envíos todavía dice que la transportadora calcula
   * el costo: el texto nuevo espera a Paula (ola 3, fase 2A). Cuando cambie,
   * este test debe pasar a comparar la página con estas constantes.
   */
  it("declares the Merchant Center shipping policy and the store threshold", () => {
    expect(STANDARD_SHIPPING_RATE).toBe(13000);
    expect(HANDLING_DAYS).toEqual({ min: 0, max: 1 });
    expect(TRANSIT_DAYS).toEqual({ min: 2, max: 5 });
    expect(ORDER_CUTOFF_TIME).toBe("12:00:00-05:00");
    expect(BUSINESS_DAYS.map((day) => day.replace("https://schema.org/", ""))).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    // El umbral sigue siendo el de la tienda, no un número escrito a mano.
    expect(page("envios")).toContain("freeShippingThreshold");
    expect(page("envios")).toMatch(/costo lo calcula la transportadora/);
  });
});

describe("buildMerchantReturnPolicy", () => {
  it("declares a finite window by mail, paid by the customer, linked to the policy page", () => {
    expect(buildMerchantReturnPolicy()).toEqual({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "CO",
      returnPolicyCountry: "CO",
      returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
      merchantReturnDays: 7,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      customerRemorseReturnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
      itemDefectReturnFees: "https://schema.org/FreeReturn",
      merchantReturnLink: "https://papeleriapdepapel.com/politicas/devoluciones",
    });
  });
});

describe("buildShippingDetails", () => {
  const delivery = {
    "@type": "ShippingDeliveryTime",
    handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
    transitTime: { "@type": "QuantitativeValue", minValue: 2, maxValue: 5, unitCode: "DAY" },
  };

  it("charges the standard rate below the threshold and nothing from it", () => {
    expect(buildShippingDetails(249999, 250000)).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: 13000, currency: "COP" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "CO" },
      deliveryTime: delivery,
    });
    // La tienda da envío gratis desde 250.000 inclusive.
    expect(buildShippingDetails(250000, 250000).shippingRate.value).toBe(0);
    expect(buildShippingDetails(300000, 250000).shippingRate.value).toBe(0);
  });

  it("falls back to the standard rate when the store has no threshold", () => {
    expect(buildShippingDetails(900000, null).shippingRate.value).toBe(13000);
    expect(buildShippingDetails(900000, 0).shippingRate.value).toBe(13000);
  });
});

describe("buildOrganizationShippingService", () => {
  it("expresses free shipping by order value with the cutoff and business days", () => {
    const service = buildOrganizationShippingService(250000);
    expect(service).toMatchObject({
      "@type": "ShippingService",
      fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
      handlingTime: {
        "@type": "ServicePeriod",
        duration: { minValue: 0, maxValue: 1, unitCode: "DAY" },
        cutoffTime: "12:00:00-05:00",
      },
    });
    expect(service.handlingTime.businessDays).toHaveLength(5);
    expect(service.shippingConditions).toEqual([
      expect.objectContaining({
        orderValue: { "@type": "MonetaryAmount", currency: "COP", minValue: 0, maxValue: 249999 },
        shippingRate: { "@type": "MonetaryAmount", value: 13000, currency: "COP" },
      }),
      expect.objectContaining({
        orderValue: { "@type": "MonetaryAmount", currency: "COP", minValue: 250000 },
        shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "COP" },
      }),
    ]);
    for (const condition of service.shippingConditions) {
      expect(condition.shippingDestination).toEqual({ "@type": "DefinedRegion", addressCountry: "CO" });
      expect(condition.transitTime).toMatchObject({ "@type": "ServicePeriod", duration: { minValue: 2, maxValue: 5, unitCode: "DAY" } });
    }
  });

  it("declares only the standard rate without a threshold", () => {
    const service = buildOrganizationShippingService(null);
    expect(service.shippingConditions).toHaveLength(1);
    expect(service.shippingConditions[0]).not.toHaveProperty("orderValue");
    expect(service.shippingConditions[0].shippingRate.value).toBe(13000);
  });
});

describe("home organization node", () => {
  /** La política por valor del pedido sale del umbral de la tienda, no de un número fijo. */
  it("builds the shipping service from Store.freeShippingThreshold", () => {
    const home = source("app/(routes)/page.tsx");
    expect(home).toContain("hasShippingService: buildOrganizationShippingService(freeShippingThreshold)");
    expect(home).toContain("hasMerchantReturnPolicy: buildMerchantReturnPolicy()");
    expect(home).toContain("buildHomeJsonLd(settings.freeShippingThreshold)");
  });
});

describe("product offers carry the policies", () => {
  it("adds the return policy and the shipping rate to every offer", () => {
    const cheap = buildProductSchema(base, true, { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(cheap.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);
    expect(cheap.offers.shippingDetails.shippingRate.value).toBe(13000);
    expect(cheap.offers.shippingDetails.deliveryTime.transitTime).toMatchObject({ minValue: 2, maxValue: 5 });

    const expensive = buildProductSchema({ ...base, price: "260000" } as Product, true, { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(expensive.offers.shippingDetails.shippingRate.value).toBe(0);
  });

  it("applies the same policies to every variant of a group", () => {
    const rosa = { ...base, id: "a", productGroupId: "g", color: { id: "c1", name: "Rosa", value: "#f0f" } } as Product;
    const azul = { ...base, id: "b", productGroupId: "g", color: { id: "c2", name: "Azul", value: "#00f" } } as Product;
    const group = buildProductJsonLd(rosa, [rosa, azul], { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(group.hasVariant.every((v: any) => v.offers.hasMerchantReturnPolicy?.merchantReturnDays === 7)).toBe(true);
    expect(group.hasVariant.every((v: any) => v.offers.shippingDetails?.shippingRate.value === 13000)).toBe(true);
  });
});
