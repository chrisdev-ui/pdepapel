import { describe, expect, it } from "vitest";

import {
  getMercadoLibreCategoryPublicationError,
  parseMercadoLibreCategoryAttributes,
  parseMercadoLibreCategorySuggestions,
  parseMercadoLibreCategoryPath,
} from "@/lib/mercadolibre/categories";

describe("Mercado Libre category helpers", () => {
  it("parses the array returned by the category predictor", () => {
    expect(
      parseMercadoLibreCategorySuggestions([
        {
          category_id: "MCO1234",
          category_name: "Papelería",
          domain_id: "MCO-STATIONERY",
          domain_name: "Papelería",
        },
        { category_id: "MLA123", category_name: "Otra región" },
      ]),
    ).toEqual([
      {
        categoryId: "MCO1234",
        categoryName: "Papelería",
        domainId: "MCO-STATIONERY",
        domainName: "Papelería",
        path: [],
      },
    ]);
  });

  it("reads the path from the root of a category payload", () => {
    expect(
      parseMercadoLibreCategoryPath({
        id: "MCO1234",
        path_from_root: [
          { id: "MCO1", name: "Hogar" },
          { id: "MCO12", name: " Cocina " },
          { id: "MCO1234", name: "Termos" },
          { id: "MCO9", name: "" },
        ],
      }),
    ).toEqual(["Hogar", "Cocina", "Termos"]);
    expect(parseMercadoLibreCategoryPath({ id: "MCO1234" })).toEqual([]);
    expect(parseMercadoLibreCategoryPath(null)).toEqual([]);
  });

  it("keeps only editable attributes that Mercado Libre marks as required", () => {
    expect(
      parseMercadoLibreCategoryAttributes([
        {
          id: "BRAND",
          name: "Marca",
          value_type: "list",
          tags: { required: true, catalog_required: true },
          values: [{ id: "1", name: "P de Papel" }],
        },
        {
          id: "OPTIONAL",
          name: "Opcional",
          tags: { catalog_required: true },
        },
        {
          id: "NEW_REQUIRED",
          name: "Requerido para nuevo",
          tags: { new_required: true },
        },
        {
          id: "INTERNAL",
          name: "Interno",
          tags: { required: true, read_only: true },
        },
        {
          id: "FIXED",
          name: "Fijo",
          tags: { required: true, fixed: true },
        },
      ]),
    ).toEqual([
      {
        id: "BRAND",
        name: "Marca",
        required: true,
        catalogRequired: true,
        valueType: "list",
        values: [{ id: "1", name: "P de Papel" }],
      },
      {
        id: "OPTIONAL",
        name: "Opcional",
        required: false,
        catalogRequired: true,
        valueType: "string",
        values: [],
      },
      {
        id: "NEW_REQUIRED",
        name: "Requerido para nuevo",
        required: true,
        valueType: "string",
        values: [],
      },
    ]);
  });

  // EMPTY_GTIN_REASON llega oculto y condicional: si se descarta, el asistente
  // nunca puede enviar el motivo de un producto sin código de barras.
  it("keeps hidden attributes the seller must send (required or conditionally required)", () => {
    expect(
      parseMercadoLibreCategoryAttributes([
        {
          id: "EMPTY_GTIN_REASON",
          name: "Motivo de GTIN vacío",
          value_type: "list",
          tags: { hidden: true, conditional_required: true, variation_attribute: true },
          values: [{ id: "17055160", name: "El producto no tiene código registrado" }],
        },
        { id: "UNITS_PER_PACK", name: "Cantidad de artículos", value_type: "number", tags: { conditional_required: true } },
        { id: "HIDDEN_PLAIN", name: "Oculto", tags: { hidden: true } },
        { id: "HIDDEN_READ_ONLY", name: "Oculto y fijo", tags: { hidden: true, conditional_required: true, read_only: true } },
      ]),
    ).toEqual([
      {
        id: "EMPTY_GTIN_REASON",
        name: "Motivo de GTIN vacío",
        required: false,
        conditionalRequired: true,
        valueType: "list",
        values: [{ id: "17055160", name: "El producto no tiene código registrado" }],
      },
      { id: "UNITS_PER_PACK", name: "Cantidad de artículos", required: false, conditionalRequired: true, valueType: "number", values: [] },
    ]);
  });

  it("keeps the first 100 list values and flags the attribute as truncated", () => {
    const values = Array.from({ length: 101 }, (_, index) => ({ id: `v${index}`, name: `Valor ${index}` }));
    const [long, short] = parseMercadoLibreCategoryAttributes([
      { id: "COLOR", name: "Color", value_type: "list", tags: { required: true }, values },
      { id: "SIZE", name: "Talla", value_type: "list", tags: { required: true }, values: values.slice(0, 50) },
    ]);
    expect(long.values).toHaveLength(100);
    expect(long.values[99]).toEqual({ id: "v99", name: "Valor 99" });
    expect(long.truncated).toBe(true);
    expect(short.values).toHaveLength(50);
    expect(short).not.toHaveProperty("truncated");
  });

  it("blocks categories that are not final or do not allow new listings", () => {
    expect(
      getMercadoLibreCategoryPublicationError(
        { id: "MCO1234", children_categories: [{ id: "MCO1235" }] },
        "MCO1234",
      ),
    ).toContain("muy general");

    expect(
      getMercadoLibreCategoryPublicationError(
        {
          id: "MCO1234",
          children_categories: [],
          settings: { item_conditions: ["used"] },
        },
        "MCO1234",
      ),
    ).toContain("no admite productos nuevos");
  });

  it("enforces the publication limits configured by the final category", () => {
    expect(
      getMercadoLibreCategoryPublicationError(
        {
          id: "MCO1234",
          children_categories: [],
          settings: {
            max_title_length: 10,
            minimum_price: 5000,
            maximum_price: 20_000,
            max_pictures_per_item: 3,
          },
        },
        "MCO1234",
        { familyName: "Agenda kawaii", price: 10_000, pictureCount: 1 },
      ),
    ).toContain("máximo 10");

    expect(
      getMercadoLibreCategoryPublicationError(
        {
          id: "MCO1234",
          children_categories: [],
          settings: { minimum_price: 5000 },
        },
        "MCO1234",
        { familyName: "Agenda", price: 4000, pictureCount: 1 },
      ),
    ).toContain("mínimo 5000");
  });
});
