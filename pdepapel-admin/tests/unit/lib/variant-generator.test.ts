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

    expect(variant.name).toBe(
      "Cintas resaltadoras clásico Fluorescente Lila S",
    );
  });

  it("keeps category naming as the fallback for legacy callers", () => {
    const [variant] = generateVariants({
      category: { id: "category-id", name: "Resaltadores" },
      designs: [{ id: "design-id", name: "Fluorescente" }],
      colors: [{ id: "color-id", name: "Lila" }],
      sizes: [{ id: "size-id", name: "Pequeño", value: "S" }],
    });

    expect(variant.name).toBe("Resaltador Fluorescente Lila S");
  });

  it("does not repeat a variant attribute already in the confirmed name", () => {
    const [variant] = generateVariants({
      baseName: "Cintas resaltadoras clásico lila",
      category: { id: "category-id", name: "Resaltadores" },
      designs: [{ id: "design-id", name: "Clásico" }],
      colors: [{ id: "color-id", name: "Lila" }],
      sizes: [{ id: "size-id", name: "Pequeño", value: "S" }],
    });

    expect(variant.name).toBe("Cintas resaltadoras clásico lila S");
  });
});
