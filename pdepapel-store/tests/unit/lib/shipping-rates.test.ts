import { describe, expect, it } from "vitest";

import {
  getShippingQuoteKey,
  groupShippingQuotes,
  isShippingQuoteFresh,
  SHIPPING_QUOTE_MAX_AGE_MS,
} from "@/lib/shipping-rates";
import { ShippingQuote } from "@/types";

const quote = (overrides: Partial<ShippingQuote>): ShippingQuote => ({
  idRate: 1,
  carrier: "COORDINADORA",
  product: "Normal",
  flete: 6630,
  minimumInsurance: 650,
  totalCost: 7280,
  deliveryDays: "2",
  isCOD: false,
  ...overrides,
});

describe("groupShippingQuotes", () => {
  it("deja una tarifa por transportadora y prefiere la que admite contraentrega al mismo precio", () => {
    const grouped = groupShippingQuotes([
      quote({ idRate: 1, isCOD: false }),
      quote({ idRate: 2, isCOD: true }),
      quote({ idRate: 3, carrier: "ENVIA", totalCost: 8117, deliveryDays: "3" }),
      quote({ idRate: 4, carrier: "ENVIA", totalCost: 8117, deliveryDays: "6", isCOD: true }),
    ]);

    expect(grouped.map((item) => item.idRate)).toEqual([2, 4]);
    expect(grouped[0].hiddenAlternatives).toBe(1);
  });

  it("prefiere la más barata aunque no admita contraentrega", () => {
    const grouped = groupShippingQuotes([
      quote({ idRate: 1, totalCost: 9000, isCOD: true }),
      quote({ idRate: 2, totalCost: 7280, isCOD: false }),
    ]);
    expect(grouped[0].idRate).toBe(2);
  });

  it("ordena por precio y marca la más económica y la más rápida", () => {
    const grouped = groupShippingQuotes([
      quote({ idRate: 1, carrier: "TCC", totalCost: 15772, deliveryDays: "1" }),
      quote({ idRate: 2, carrier: "RAPPI", totalCost: 8950, deliveryDays: "0" }),
      quote({ idRate: 3, carrier: "COORDINADORA", totalCost: 7280, deliveryDays: "2" }),
    ]);

    expect(grouped.map((item) => item.carrier)).toEqual([
      "COORDINADORA",
      "RAPPI",
      "TCC",
    ]);
    expect(grouped[0].badges).toEqual(["cheapest"]);
    expect(grouped[1].badges).toEqual(["fastest"]);
    expect(grouped[2].badges).toEqual([]);
  });

  it("no marca nada cuando solo hay una tarifa", () => {
    expect(groupShippingQuotes([quote({})])[0].badges).toEqual([]);
    expect(groupShippingQuotes([])).toEqual([]);
  });
});

describe("getShippingQuoteKey", () => {
  it("es estable ante el orden de los productos y mayúsculas en la dirección", () => {
    const a = getShippingQuoteKey({
      daneCode: "05001000",
      address: "Calle 12 AA Sur #55D-30",
      orderTotal: 3000,
      items: [
        { productId: "b", quantity: 1 },
        { productId: "a", quantity: 2 },
      ],
    });
    const b = getShippingQuoteKey({
      daneCode: "05001000",
      address: "calle 12 aa sur #55d-30 ",
      orderTotal: 3000.4,
      items: [
        { productId: "a", quantity: 2 },
        { productId: "b", quantity: 1 },
      ],
    });
    expect(a).toBe(b);
  });

  it("cambia cuando cambia la cantidad", () => {
    const base = { daneCode: "05001000", address: "x", orderTotal: 1 };
    expect(
      getShippingQuoteKey({ ...base, items: [{ productId: "a", quantity: 1 }] }),
    ).not.toBe(
      getShippingQuoteKey({ ...base, items: [{ productId: "a", quantity: 2 }] }),
    );
  });
});

describe("isShippingQuoteFresh", () => {
  it("expira después de la edad máxima", () => {
    const now = 1_000_000_000;
    expect(isShippingQuoteFresh(now - 1000, now)).toBe(true);
    expect(isShippingQuoteFresh(now - SHIPPING_QUOTE_MAX_AGE_MS - 1, now)).toBe(false);
    expect(isShippingQuoteFresh(null, now)).toBe(false);
  });
});
