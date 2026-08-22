import { describe, expect, it } from "vitest";

import {
  getMercadoLibreCategoryPublicationError,
  parseMercadoLibreCategoryAttributes,
  parseMercadoLibreCategorySuggestions,
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
      },
    ]);
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
        valueType: "list",
        values: [{ id: "1", name: "P de Papel" }],
      },
      {
        id: "OPTIONAL",
        name: "Opcional",
        required: false,
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
        { title: "Agenda kawaii", price: 10_000, pictureCount: 1 },
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
        { title: "Agenda", price: 4000, pictureCount: 1 },
      ),
    ).toContain("mínimo 5000");
  });
});
