import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RETURN_WINDOW_DAYS,
  buildFreeShippingDetails,
  buildMerchantReturnPolicy,
} from "@/lib/commerce-policies";
import { buildProductJsonLd, buildProductSchema } from "@/lib/product-schema";
import type { Product } from "@/types";

const page = (path: string) =>
  readFileSync(join(__dirname, "../../../app/(routes)/politicas", path, "page.tsx"), "utf8");

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
    expect(returns).toContain(`(${RETURN_WINDOW_DAYS}) días calendario`);
    expect(returns).toContain(`${RETURN_WINDOW_DAYS} días calendario`);
    // El cliente paga el envío cuando la devolución es por decisión suya.
    expect(returns).toMatch(/costos de envío corren por tu cuenta/);
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
      merchantReturnDays: 5,
      returnMethod: "https://schema.org/ReturnByMail",
      returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
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
    });
  });
});

describe("product offers carry the policies", () => {
  it("adds the return policy to every offer and free shipping only above the threshold", () => {
    const cheap = buildProductSchema(base, true, { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(cheap.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(5);
    expect(cheap.offers.shippingDetails).toBeUndefined();

    const expensive = buildProductSchema({ ...base, price: "260000" } as Product, true, { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(expensive.offers.shippingDetails.shippingRate.value).toBe(0);
  });

  it("applies the same policies to every variant of a group", () => {
    const rosa = { ...base, id: "a", productGroupId: "g", color: { id: "c1", name: "Rosa", value: "#f0f" } } as Product;
    const azul = { ...base, id: "b", productGroupId: "g", color: { id: "c2", name: "Azul", value: "#00f" } } as Product;
    const group = buildProductJsonLd(rosa, [rosa, azul], { freeShippingThreshold: 250000 }) as Record<string, any>;
    expect(group.hasVariant.every((v: any) => v.offers.hasMerchantReturnPolicy?.merchantReturnDays === 5)).toBe(true);
  });
});
