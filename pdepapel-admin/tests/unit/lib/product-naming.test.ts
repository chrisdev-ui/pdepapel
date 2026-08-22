import {
  PRODUCT_NAME_MAX_LENGTH,
  buildProductNameSuggestion,
  getCustomerFacingSizeName,
  getCategoryHeadNoun,
} from "@/lib/product-naming";
import { describe, expect, it } from "vitest";

describe("product naming", () => {
  it("builds a readable factual title with real variant attributes", () => {
    const result = buildProductNameSuggestion({
      baseName: "mini impresora térmica portátil",
      brand: "Gatito",
      colorName: "Rosa",
      sizeName: "57 mm",
      includeVariantAttributes: true,
    });

    expect(result.name).toBe(
      "Mini impresora térmica portátil Gatito Rosa 57 mm",
    );
    expect(result.warnings).toEqual([]);
  });

  it("does not repeat attributes already present in the package name", () => {
    const result = buildProductNameSuggestion({
      baseName: "Resaltador Stabilo rosa pastel",
      brand: "Stabilo",
      colorName: "Rosa",
      designName: "Pastel",
      includeVariantAttributes: true,
    });

    expect(result.name).toBe("Resaltador Stabilo rosa pastel");
  });

  it("keeps variant attributes out of a group title", () => {
    const result = buildProductNameSuggestion({
      baseName: "Cintas resaltadoras clásico",
      brand: "Snoopy",
      colorName: "Lila",
      sizeName: "Pequeño",
      includeVariantAttributes: false,
    });

    expect(result.name).toBe("Cintas resaltadoras clásico Snoopy");
  });

  it("uses a category noun only as a safe fallback", () => {
    const result = buildProductNameSuggestion({
      categoryName: "Bolígrafos / Lapiceros",
      colorName: "Azul",
      includeVariantAttributes: true,
    });

    expect(getCategoryHeadNoun("Papeles especiales")).toBe(
      "Papeles especiales",
    );
    expect(result.name).toBe("Lapicero Azul");
    expect(result.warnings).toContain(
      "Agrega el nombre o detalle que aparece en el empaque antes de guardar.",
    );
  });

  it("warns before a title exceeds the hard limit", () => {
    const result = buildProductNameSuggestion({
      baseName: "A".repeat(PRODUCT_NAME_MAX_LENGTH + 1),
    });

    expect(result.warnings).toContain(
      `El nombre supera el máximo permitido de ${PRODUCT_NAME_MAX_LENGTH} caracteres.`,
    );
  });

  it("does not confuse short sizes with letters inside other words", () => {
    const result = buildProductNameSuggestion({
      baseName: "Cintas resaltadoras clásico",
      sizeName: "S",
      includeVariantAttributes: true,
    });

    expect(result.name).toBe("Cintas resaltadoras clásico");
  });

  it("excludes internal logistics sizes from customer-facing names", () => {
    const result = buildProductNameSuggestion({
      baseName: "Troqueles de figuras en maletín x8 de 1 cm",
      categoryName: "Manualidades",
      designName: "Clásico",
      colorName: "Pastel",
      sizeName: "M+",
      sizeValue: "M-P",
      includeVariantAttributes: true,
    });

    expect(result.name).toBe(
      "Troqueles de figuras en maletín x8 de 1 cm Clásico Pastel",
    );
  });

  it("keeps commercial measurements that help customers choose a product", () => {
    expect(
      getCustomerFacingSizeName({
        categoryName: "Cuadernos",
        sizeName: "A5",
        sizeValue: "A5",
      }),
    ).toBe("A5");
  });
});
