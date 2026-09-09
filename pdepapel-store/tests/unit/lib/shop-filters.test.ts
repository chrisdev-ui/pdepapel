import { describe, expect, it } from "vitest";

import {
  buildActiveFilterChips,
  countActiveFilters,
  EMPTY_FILTERS,
  formatProductCount,
  formatResultRange,
  removeFilterChip,
  tintForKey,
} from "@/lib/shop-filters";

const lookups = {
  types: [{ id: "t1", name: "Cuadernos" }],
  colors: [{ id: "c1", name: "Rosa" }],
  categories: [{ id: "k1", name: "Stickers" }],
};

describe("shop filters", () => {
  it("counts every applied value once", () => {
    expect(countActiveFilters(EMPTY_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...EMPTY_FILTERS, typeId: ["t1"], colorId: ["c1", "c2"], minPrice: 10000, isOnSale: true, search: "x" }),
    ).toBe(6);
    expect(countActiveFilters({ ...EMPTY_FILTERS, search: "x", categoryId: ["k1"] }, ["search", "categoryId"])).toBe(0);
  });

  it("builds readable chips in reading order and skips unknown ids", () => {
    const chips = buildActiveFilterChips(
      { ...EMPTY_FILTERS, search: "snoopy", typeId: ["t1"], colorId: ["c1", "ghost"], minPrice: 10000, maxPrice: 20000, isOnSale: true },
      lookups,
    );
    expect(chips.map((chip) => chip.label)).toEqual([
      "Búsqueda: «snoopy»",
      "Cuadernos",
      "Rosa",
      "$ 10.000 – $ 20.000",
      "Solo ofertas",
    ]);
  });

  it("hides the fixed category of a category page", () => {
    const chips = buildActiveFilterChips({ ...EMPTY_FILTERS, categoryId: ["k1"], colorId: ["c1"] }, lookups, ["categoryId"]);
    expect(chips.map((chip) => chip.label)).toEqual(["Rosa"]);
  });

  it("removes one chip and resets the page", () => {
    const filters = { ...EMPTY_FILTERS, colorId: ["c1", "c2"], minPrice: 5000, maxPrice: 9000, isOnSale: true, page: 3 };
    expect(removeFilterChip(filters, { key: "colorId", value: "c1", label: "Rosa" })).toMatchObject({ colorId: ["c2"], page: 1 });
    expect(removeFilterChip(filters, { key: "minPrice", value: null, label: "" })).toMatchObject({ minPrice: null, maxPrice: null });
    expect(removeFilterChip(filters, { key: "isOnSale", value: null, label: "" })).toMatchObject({ isOnSale: false });
  });

  it("describes the visible range", () => {
    expect(formatResultRange(1, 24, 1980)).toBe("Mostrando 1–24 de 1.980 productos");
    expect(formatResultRange(83, 24, 1980)).toBe("Mostrando 1969–1980 de 1.980 productos");
    expect(formatResultRange(1, 24, 1)).toBe("1 producto");
    expect(formatResultRange(1, 24, 0)).toBe("Sin productos");
    expect(formatProductCount(28)).toBe("28 productos");
  });

  it("assigns a stable tint per key", () => {
    expect(tintForKey("stickers")).toEqual(tintForKey("stickers"));
    expect(tintForKey("stickers").bg).toMatch(/^bg-kawaii/);
  });
});
