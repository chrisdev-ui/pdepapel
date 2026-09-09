import { describe, expect, it } from "vitest";

import { currencyFormatter } from "@/lib/utils";

const money = (value: number) => currencyFormatter.format(value);

import {
  getAverageRating,
  getProductCardBadges,
  getProductCardPrice,
  isLowStock,
  isRecentlyCreated,
} from "@/lib/product-card";

const NOW = new Date("2026-09-09T15:00:00.000Z");
const base = { stock: 10, isGroup: false, hasDiscount: false, offerLabel: null, variantCount: 0, availableAt: null, price: "25000", originalPrice: undefined, minPrice: undefined };

describe("product card badges", () => {
  it("gives the commercial slot to coming soon, then sold out, then offer", () => {
    expect(getProductCardBadges({ ...base, availableAt: "2026-10-01T05:00:00.000Z", stock: 0, originalPrice: 30000 }, { now: NOW }).commercial).toEqual({ text: "Llega el 1 de oct", tone: "comingSoon" });
    expect(getProductCardBadges({ ...base, stock: 0, originalPrice: 30000 }, { now: NOW }).commercial).toEqual({ text: "Agotado", tone: "soldOut" });
    expect(getProductCardBadges({ ...base, price: "21250", originalPrice: 25000 }, { now: NOW }).commercial).toEqual({ text: "15 % OFF", tone: "offer" });
    expect(getProductCardBadges(base, { now: NOW }).commercial).toBeNull();
  });

  it("gives the catalog slot to options over new and moves new inline", () => {
    const withOptions = getProductCardBadges({ ...base, isGroup: true, variantCount: 4 }, { isNew: true, now: NOW });
    expect(withOptions.catalog).toEqual({ text: "4 opciones", tone: "options" });
    expect(withOptions.newInline).toBe(true);

    const onlyNew = getProductCardBadges(base, { isNew: true, now: NOW });
    expect(onlyNew.catalog).toEqual({ text: "¡Nuevo!", tone: "new" });
    expect(onlyNew.newInline).toBe(false);
  });

  it("labels group offers without a percentage", () => {
    expect(getProductCardBadges({ ...base, isGroup: true, variantCount: 2, hasDiscount: true, minPrice: 9000 }, { now: NOW }).commercial).toEqual({ text: "Opciones en oferta", tone: "offer" });
  });
});

describe("product card price", () => {
  it("keeps the discount visible in the price row even when the badge is taken", () => {
    const price = getProductCardPrice({ price: "21250", originalPrice: 25000, isGroup: false, hasDiscount: true });
    expect(price.current).toBe(money(21250));
    expect(price.original).toBe(money(25000));
    expect(price.savings).toBe(`Ahorra ${money(3750)}`);
    expect(price.percent).toBe(15);
  });

  it("prefixes ranged groups with Desde", () => {
    const price = getProductCardPrice({ price: "4500", minPrice: 4500, maxPrice: 9000, isGroup: true, hasDiscount: false });
    expect(price.prefix).toBe("Desde");
    expect(price.current).toBe(money(4500));
    expect(price.original).toBeNull();
  });
});

describe("product card helpers", () => {
  it("flags low stock only for single products with 1 to 3 units", () => {
    expect(isLowStock({ stock: 2, isGroup: false })).toBe(true);
    expect(isLowStock({ stock: 0, isGroup: false })).toBe(false);
    expect(isLowStock({ stock: 2, isGroup: true })).toBe(false);
  });

  it("averages published reviews and detects recent products", () => {
    expect(getAverageRating([{ rating: 5 }, { rating: 4 }])).toEqual({ average: 4.5, count: 2 });
    expect(getAverageRating([])).toBeNull();
    expect(isRecentlyCreated({ createdAt: "2026-09-01T00:00:00.000Z" }, NOW)).toBe(true);
    expect(isRecentlyCreated({ createdAt: "2026-07-01T00:00:00.000Z" }, NOW)).toBe(false);
  });
});
