import { describe, expect, it } from "vitest";

import { categoryScopeWhere, resolveCategoryScope } from "@/lib/catalog-category-scope";

const cat = (id: string, typeId: string) => ({ id, typeId });

describe("resolveCategoryScope", () => {
  it("sin tipo ni subcategoría no filtra", () => {
    expect(resolveCategoryScope({ requestedCategoryIds: [], selectedCategories: [], typeRequested: false, typeCategories: [] })).toBeUndefined();
  });

  it("un tipo trae todas sus subcategorías", () => {
    expect(
      resolveCategoryScope({ requestedCategoryIds: [], selectedCategories: [], typeRequested: true, typeCategories: [cat("a1", "A"), cat("a2", "A")] }),
    ).toEqual(["a1", "a2"]);
  });

  it("un tipo desconocido o sin subcategorías no trae nada (no todo el catálogo)", () => {
    expect(resolveCategoryScope({ requestedCategoryIds: [], selectedCategories: [], typeRequested: true, typeCategories: [] })).toEqual([]);
    expect(categoryScopeWhere([])).toEqual({ in: ["__NO_CATEGORY_MATCH__"] });
  });

  it("una subcategoría elegida reduce solo su propio tipo", () => {
    expect(
      resolveCategoryScope({
        requestedCategoryIds: ["a1"],
        selectedCategories: [cat("a1", "A")],
        typeRequested: true,
        typeCategories: [cat("a1", "A"), cat("a2", "A"), cat("b1", "B"), cat("b2", "B")],
      }),
    ).toEqual(["a1", "b1", "b2"]);
  });

  it("una subcategoría sola, sin tipo", () => {
    expect(resolveCategoryScope({ requestedCategoryIds: ["a1"], selectedCategories: [cat("a1", "A")], typeRequested: false, typeCategories: [] })).toEqual(["a1"]);
  });

  it("una subcategoría que no existe no trae nada", () => {
    expect(resolveCategoryScope({ requestedCategoryIds: ["no-existe"], selectedCategories: [], typeRequested: false, typeCategories: [] })).toEqual([]);
  });

  it("sin alcance no hay condición", () => {
    expect(categoryScopeWhere(undefined)).toBeUndefined();
    expect(categoryScopeWhere(["a1"])).toEqual({ in: ["a1"] });
  });
});
