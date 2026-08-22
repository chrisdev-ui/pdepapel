import { generateVariants } from "@/lib/variant-generator";
import { describe, expect, it } from "vitest";

describe("generateVariants", () => {
  it("uses the confirmed group name instead of a generic category title", () => {
    const [variant] = generateVariants({
      baseName: "Cintas resaltadoras clásico",
      category: { id: "category-id", name: "Resaltadores" },
      designs: [{ id: "design-id", name: "Fluorescente" }],
      colors: [{ id: "color-id", name: "Lila" }],
      sizes: [{ id: "size-id", name: "Pequeño", value: "S" }],
    });

    expect(variant.name).toBe("Cintas resaltadoras clásico Fluorescente Lila");
  });

  it("keeps category naming as the fallback for legacy callers", () => {
    const [variant] = generateVariants({
      category: { id: "category-id", name: "Resaltadores" },
      designs: [{ id: "design-id", name: "Fluorescente" }],
      colors: [{ id: "color-id", name: "Lila" }],
      sizes: [{ id: "size-id", name: "Pequeño", value: "S" }],
    });

    expect(variant.name).toBe("Resaltador Fluorescente Lila");
  });

  it("does not repeat a variant attribute already in the confirmed name", () => {
    const [variant] = generateVariants({
      baseName: "Cintas resaltadoras clásico lila",
      category: { id: "category-id", name: "Resaltadores" },
      designs: [{ id: "design-id", name: "Clásico" }],
      colors: [{ id: "color-id", name: "Lila" }],
      sizes: [{ id: "size-id", name: "Pequeño", value: "S" }],
    });

    expect(variant.name).toBe("Cintas resaltadoras clásico lila");
  });

  it("keeps the logistics size in the SKU but never adds its code to a title", () => {
    const [variant] = generateVariants({
      baseName: "Troqueles de figuras en maletín x8 de 1 cm",
      category: { id: "category-id", name: "Manualidades" },
      designs: [{ id: "design-id", name: "Clásico" }],
      colors: [{ id: "color-id", name: "Pastel" }],
      sizes: [{ id: "size-id", name: "M+", value: "M-P" }],
    });

    expect(variant.name).toBe(
      "Troqueles de figuras en maletín x8 de 1 cm Clásico Pastel",
    );
    expect(variant.sku).toMatch(/-M-P-\d{4}$/);
  });

  it("uses a readable size when customers genuinely choose it", () => {
    const [variant] = generateVariants({
      baseName: "Camiseta estampada",
      category: { id: "category-id", name: "Ropa" },
      designs: [{ id: "design-id", name: "Gatito" }],
      colors: [{ id: "color-id", name: "Rosa" }],
      sizes: [{ id: "size-id", name: "M", value: "M-P" }],
    });

    expect(variant.name).toBe("Camiseta estampada Gatito Rosa M");
    expect(variant.sku).toMatch(/-M-P-\d{4}$/);
  });
});
