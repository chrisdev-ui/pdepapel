import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/utils", () => ({ currencyFormatter: (value: number) => `$ ${value}` }));

import { assertFixedAmountBelowPrices, assertOfferTargetsInStore, offerTargetsData, parseOfferInput } from "@/lib/offers";

const base = { name: " Regreso a clases ", label: "  ", type: "FIXED", amount: 5000, startDate: "2026-09-08", endDate: "2026-12-30", productIds: ["p1", "p1"] };

describe("parseOfferInput", () => {
  it("trims the name, drops an empty label, dedupes targets and expands the window", () => {
    const input = parseOfferInput(base);
    expect(input).toMatchObject({ name: "Regreso a clases", label: null, productIds: ["p1"], categoryIds: [], productGroupIds: [], isActive: true });
    expect(input.startDate.toISOString()).toBe("2026-09-08T05:00:00.000Z");
    expect(input.endDate.toISOString()).toBe("2026-12-31T04:59:59.999Z");
  });

  it("requires at least one target and valid amounts", () => {
    expect(() => parseOfferInput({ ...base, productIds: [] })).toThrow("Elige al menos un producto, grupo o subcategoría");
    expect(() => parseOfferInput({ ...base, amount: 0 })).toThrow("El descuento debe ser mayor a 0");
    expect(() => parseOfferInput({ ...base, type: "PERCENTAGE", amount: 101 })).toThrow("El porcentaje no puede ser mayor a 100");
    expect(() => parseOfferInput({ ...base, name: "" })).toThrow("Escribe el nombre interno");
    expect(() => parseOfferInput({ ...base, startDate: "2027-01-01" })).toThrow("La fecha de inicio no puede ser posterior");
  });
});

describe("offer target guards", () => {
  it("rejects ids that are not in the store", async () => {
    const db = {
      product: { count: vi.fn().mockResolvedValue(1) },
      category: { count: vi.fn().mockResolvedValue(0) },
      productGroup: { count: vi.fn().mockResolvedValue(0) },
    } as never;
    await expect(assertOfferTargetsInStore(db, "s1", { productIds: ["p1"], categoryIds: ["c9"], productGroupIds: [] })).rejects.toThrow("subcategorías elegidas no existe");
    await expect(assertOfferTargetsInStore(db, "s1", { productIds: ["p1"], categoryIds: [], productGroupIds: [] })).resolves.toBeUndefined();
  });

  it("refuses a fixed amount that would leave a product free", async () => {
    const db = { product: { findMany: vi.fn().mockResolvedValue([{ name: "Lapicero" }]) } } as never;
    await expect(assertFixedAmountBelowPrices(db, "s1", { type: "FIXED", amount: 9000, productIds: ["p1"], categoryIds: [], productGroupIds: [] })).rejects.toThrow("dejaría en $ 0 a Lapicero");
    await expect(assertFixedAmountBelowPrices(db, "s1", { type: "PERCENTAGE", amount: 100, productIds: ["p1"], categoryIds: [], productGroupIds: [] })).resolves.toBeUndefined();
  });

  it("shapes the nested create payload", () => {
    expect(offerTargetsData({ productIds: ["p1"], categoryIds: [], productGroupIds: ["g1"] })).toEqual({
      products: { create: [{ product: { connect: { id: "p1" } } }] },
      categories: { create: [] },
      productGroups: { create: [{ productGroup: { connect: { id: "g1" } } }] },
    });
  });
});
