import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  HANDLING_DAYS,
  MERCHANT_RETURN_DAYS,
  RETURN_WINDOW_DAYS,
  buildFreeShippingDetails,
  buildMerchantReturnPolicy,
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

  it("only promises a shipping rate the shipping page publishes", () => {
    const shipping = page("envios");
    // No hay tarifa fija: la calcula la transportadora; solo el umbral es gratis.
    expect(shipping).toMatch(/costo lo calcula la transportadora/);
    expect(shipping).toContain("freeShippingThreshold");
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

describe("buildFreeShippingDetails", () => {
  it("is free from the threshold up and absent below it or without a threshold", () => {
    expect(buildFreeShippingDetails(249999, 250000)).toBeNull();
    expect(buildFreeShippingDetails(300000, null)).toBeNull();
    expect(buildFreeShippingDetails(250000, 250000)).toEqual({
      "@type": "OfferShippingDetails",
      shippingRate: { "@type": "MonetaryAmount", value: 0, currency: "COP" },
      shippingDestination: { "@type": "DefinedRegion", addressCountry: "CO" },
      deliveryTime: {
        "@type": "ShippingDeliveryTime",
        handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      },
    });
    // Sin tránsito: depende de la transportadora y no hay un dato publicado.
    expect(buildFreeShippingDetails(250000, 250000)?.deliveryTime).not.toHaveProperty("transitTime");
  });
});

describe("product offers carry the policies", () => {
  it("adds the return policy to every offer and free shipping only above the threshold", () => {
    const cheap = buildProductSchema(base, true, { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(cheap.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);
    expect(cheap.offers.shippingDetails).toBeUndefined();

    const expensive = buildProductSchema({ ...base, price: "260000" } as Product, true, { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(expensive.offers.shippingDetails.shippingRate.value).toBe(0);
  });

  it("applies the same policies to every variant of a group", () => {
    const rosa = { ...base, id: "a", productGroupId: "g", color: { id: "c1", name: "Rosa", value: "#f0f" } } as Product;
    const azul = { ...base, id: "b", productGroupId: "g", color: { id: "c2", name: "Azul", value: "#00f" } } as Product;
    const group = buildProductJsonLd(rosa, [rosa, azul], { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(group.hasVariant.every((v: any) => v.offers.hasMerchantReturnPolicy?.merchantReturnDays === 7)).toBe(true);
  });
});
