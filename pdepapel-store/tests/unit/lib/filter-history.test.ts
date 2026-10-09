import { describe, expect, it } from "vitest";

import type { ProductFilters } from "@/hooks/use-product-filters";
import { filterHistoryMode } from "@/lib/filter-history";

const base: ProductFilters = {
  typeId: [],
  categoryId: [],
  colorId: [],
  sizeId: [],
  designId: [],
  optionValueId: [],
  minPrice: null,
  maxPrice: null,
  sortOption: "",
  page: 1,
  search: "",
  isOnSale: false,
  exact: false,
};

describe("filterHistoryMode", () => {
  it("cambiar de tipo o de subcategoría es una navegación: se apila", () => {
    expect(filterHistoryMode(base, { ...base, typeId: ["t-1"] })).toBe("push");
    expect(filterHistoryMode({ ...base, categoryId: ["c-1"], page: 3 }, { ...base, categoryId: ["c-2"], page: 1 })).toBe("push");
    expect(filterHistoryMode({ ...base, typeId: ["t-1"] }, { ...base, typeId: [] })).toBe("push");
  });

  it("cambiar solo de página también se apila", () => {
    expect(filterHistoryMode(base, { ...base, page: 2 })).toBe("push");
  });

  it("los ajustes continuos reemplazan: precio, orden, búsqueda, ofertas, colores", () => {
    expect(filterHistoryMode(base, { ...base, minPrice: 5000 })).toBe("replace");
    expect(filterHistoryMode(base, { ...base, sortOption: "price-asc" })).toBe("replace");
    expect(filterHistoryMode(base, { ...base, search: "lápiz" })).toBe("replace");
    expect(filterHistoryMode(base, { ...base, isOnSale: true })).toBe("replace");
    expect(filterHistoryMode({ ...base, page: 4 }, { ...base, colorId: ["rosa"], page: 1 })).toBe("replace");
  });

  it("el mismo tipo en otro orden o null frente a vacío no cuenta como cambio", () => {
    expect(filterHistoryMode({ ...base, typeId: ["a", "b"] }, { ...base, typeId: ["b", "a"], isOnSale: true })).toBe("replace");
    expect(filterHistoryMode(base, { ...base, typeId: null as never, colorId: ["x"] })).toBe("replace");
  });
});
