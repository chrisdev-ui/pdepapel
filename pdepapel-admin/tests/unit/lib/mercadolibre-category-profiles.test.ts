import { describe, expect, it } from "vitest";

import {
  addCategoryUse,
  groupListingsForBackfill,
  learnedProfileAttributes,
  rankCategorySuggestions,
  shouldAutoApplyProfile,
  suggestModelName,
} from "@/lib/mercadolibre/category-profiles";
import { prefillListingAttributes } from "@/lib/mercadolibre/listing-wizard";

describe("categorías aprendidas por subcategoría", () => {
  it("suma usos y ordena por uso y después por lo más reciente", () => {
    const first = addCategoryUse([], { categoryId: "MCO1", categoryName: "Cartucheras", at: "2026-10-01T00:00:00Z" });
    const second = addCategoryUse(first, { categoryId: "MCO2", categoryName: "Estuches", at: "2026-10-02T00:00:00Z" });
    const third = addCategoryUse(second, { categoryId: "MCO1", categoryName: "Cartucheras", at: "2026-10-03T00:00:00Z" });
    expect(third.map((candidate) => [candidate.categoryId, candidate.uses])).toEqual([
      ["MCO1", 2],
      ["MCO2", 1],
    ]);
    expect(addCategoryUse(third, { categoryId: "MCO2", categoryName: null, at: "2026-10-04T00:00:00Z" })[0].categoryId).toBe("MCO2");
  });

  it("una sugerida espera el primer «Usar esta»; aceptada o manual se aplica sola", () => {
    expect(shouldAutoApplyProfile({ state: "SUGGESTED" })).toBe(false);
    expect(shouldAutoApplyProfile({ state: "ACCEPTED" })).toBe(true);
  });

  it("la ficha aprendida guarda lo común y nunca lo de una variante ni las medidas del paquete", () => {
    expect(
      learnedProfileAttributes([
        { id: "BRAND", value_name: "Genérica" },
        { id: "MODEL", value_name: "Bolsillo mágico" },
        { id: "MATERIAL", value_name: "Lona" },
        { id: "COLOR", value_name: "Rosa pastel" },
        { id: "GTIN", value_name: "123" },
        { id: "PACKAGE_WEIGHT", value_name: "400 g" },
      ]),
    ).toEqual([
      { id: "BRAND", value_name: "Genérica" },
      { id: "MATERIAL", value_name: "Lona" },
    ]);
  });

  it("para sembrar deja fuera las subcategorías mezcladas y las que ya tienen perfil", () => {
    const groups = groupListingsForBackfill(
      [
        { localCategoryId: "cart", localCategoryName: "Cartucheras", categoryId: "MCO441855", attributes: [] },
        { localCategoryId: "cart", localCategoryName: "Cartucheras", categoryId: "MCO441855", attributes: [] },
        { localCategoryId: "herr", localCategoryName: "Herramientas de oficina", categoryId: "MCO441856", attributes: [] },
        { localCategoryId: "herr", localCategoryName: "Herramientas de oficina", categoryId: "MCO403380", attributes: [] },
        { localCategoryId: "mugs", localCategoryName: "Mugs", categoryId: "MCO166167", attributes: [] },
      ],
      new Set(["mugs"]),
    );
    expect(groups.map((group) => [group.localCategoryName, group.categoryId, group.listings, group.skipped])).toEqual([
      ["Cartucheras", "MCO441855", 2, null],
      ["Herramientas de oficina", null, 2, "mezclada"],
      ["Mugs", "MCO166167", 1, "ya tiene perfil"],
    ]);
  });
});

describe("sugerencias de la ficha", () => {
  it("el modelo sale del grupo o del nombre sin color, talla ni diseño", () => {
    expect(suggestModelName({ name: "Cartuchera Bolsillo mágico Rosa pastel", productGroupName: "Cartuchera Bolsillo mágico", colorName: "Rosa pastel" })).toBe("Cartuchera Bolsillo mágico");
    expect(suggestModelName({ name: "Mug pancito Grande Azul", colorName: "Azul", sizeName: "Grande" })).toBe("Mug pancito");
    expect(suggestModelName({ name: "  ", colorName: null })).toBeNull();
  });

  it("MODEL y UNITS_PER_PACK se rellenan solo si están vacíos; un kit no recibe «1»", () => {
    const attributes = [
      { id: "MODEL", required: true },
      { id: "UNITS_PER_PACK", required: false, conditionalRequired: true },
    ];
    expect(prefillListingAttributes("", attributes, { modelName: "Bolsillo mágico" }).split("\n")).toEqual(["MODEL=Bolsillo mágico", "UNITS_PER_PACK=1"]);
    expect(prefillListingAttributes("MODEL=Escrito por Paula", attributes, { modelName: "Bolsillo mágico" })).toBe("MODEL=Escrito por Paula\nUNITS_PER_PACK=1");
    expect(prefillListingAttributes("", attributes, { modelName: "Kit", isKit: true })).toBe("MODEL=Kit");
  });
});

describe("categorías de otro rubro", () => {
  it("bajan al final con una etiqueta, nunca desaparecen", () => {
    const ranked = rankCategorySuggestions([
      { categoryId: "MCO430695", domainId: "MCO-DIE_NUTS", domainName: "Dados de tarrajas" },
      { categoryId: "MCO420287", domainId: "MCO-TOY_STORAGE_ORGANIZERS", domainName: "Organizadores de juguetes" },
      { categoryId: "MCO172629", domainId: "MCO-PAPER_PUNCHES", domainName: "Perforadoras" },
    ]);
    expect(ranked.map((suggestion) => [suggestion.categoryId, suggestion.otherTrade])).toEqual([
      ["MCO172629", false],
      ["MCO430695", true],
      ["MCO420287", true],
    ]);
  });
});
