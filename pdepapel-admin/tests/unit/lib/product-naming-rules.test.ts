import { describe, expect, it } from "vitest";

import {
  fitProductName,
  formatProductQuantity,
  getCanonicalHeadNoun,
  isLicenceName,
  normalizeBrandName,
  normalizeSuggestedProductName,
  PRODUCT_NAME_HARD_MAX_LENGTH,
} from "@/lib/product-naming";

describe("reglas de nombre de la gramática", () => {
  it("el tope es 60 y se recorta por palabra, nunca a media palabra ni con un conector al final", () => {
    expect(PRODUCT_NAME_HARD_MAX_LENGTH).toBe(60);
    const long =
      "Cuaderno argollado Norma 5 materias cuadriculado grande Let's Fly Away";
    const fitted = fitProductName(long);
    expect(fitted.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(fitted)).toBe(true);
    expect(fitted).toBe(
      "Cuaderno argollado Norma 5 materias cuadriculado grande",
    );
    expect(
      fitProductName("Set de marcadores acrílicos Gipao punta pincel con"),
    ).toBe("Set de marcadores acrílicos Gipao punta pincel");
    expect(fitProductName("  Lapicero   de gel  ")).toBe("Lapicero de gel");
  });

  it("al recortar conserva la cantidad del final y nunca deja un número suelto", () => {
    expect(
      fitProductName(
        "Set de marcadores Primavera escarchados punta fina 3.3 mm 10 colores",
      ),
    ).toBe("Set de marcadores Primavera escarchados 10 colores");
    expect(
      fitProductName(
        "Set de marcadores Primavera punta 3,3 mm diseño Flower Power 10 colores",
      ),
    ).toBe("Set de marcadores Primavera punta 3,3 mm 10 colores");
    expect(
      fitProductName(
        "Set de lapiceros semi gel Offi-Esco con aroma a frutas tropicales x10",
      ),
    ).toBe("Set de lapiceros semi gel Offi-Esco con aroma a frutas x10");
    expect(
      fitProductName(
        "Set de marcadores Primavera escarchados punta fina 3.3 mm 10 unidades largas",
      ),
    ).toBe("Set de marcadores Primavera escarchados punta fina 3.3 mm");
  });

  it("cantidad: «N colores» o «N diseños» si el empaque mezcla; «xN» si son iguales", () => {
    expect(formatProductQuantity(12, "colores")).toBe("12 colores");
    expect(formatProductQuantity(6, "diseños")).toBe("6 diseños");
    expect(formatProductQuantity(10, null)).toBe("x10");
    expect(formatProductQuantity(1, null)).toBeNull();
  });

  it("marca de fabricante en Title Case; una licencia no es marca", () => {
    expect(normalizeBrandName("GIPAO")).toBe("Gipao");
    expect(normalizeBrandName("OFFI-ESCO")).toBe("Offi-Esco");
    expect(normalizeBrandName("faber-castell")).toBe("Faber-Castell");
    expect(isLicenceName("Sanrio")).toBe(true);
    expect(isLicenceName("hello kitty")).toBe(true);
    expect(isLicenceName("Flower Power")).toBe(true);
    expect(isLicenceName("Norma")).toBe(false);
  });

  it("sustantivo canónico por subcategoría, sin barras", () => {
    expect(getCanonicalHeadNoun("Bolígrafos / Lapiceros")).toEqual({
      singular: "Lapicero",
      plural: "Lapiceros",
    });
    expect(getCanonicalHeadNoun("Sketchbook / Bitácora")).toEqual({
      singular: "Sketchbook",
      plural: "Sketchbooks",
    });
    expect(getCanonicalHeadNoun("Sacapuntas")).toEqual({
      singular: "Tajalápiz",
      plural: "Tajalápices",
    });
    expect(getCanonicalHeadNoun("Subcategoría inexistente")).toBeNull();
  });

  it("limpia un nombre propuesto: sin barras, sin mayúscula sostenida de marca, sin adjetivos de venta, ≤60", () => {
    expect(
      normalizeSuggestedProductName(
        "Sketchbook / Bitácora William Morris diseño Van Gogh",
      ),
    ).toBe("Sketchbook William Morris diseño Van Gogh");
    expect(
      normalizeSuggestedProductName(
        "Set de marcadores acrílicos GIPAO punta pincel 12 colores",
      ),
    ).toBe("Set de marcadores acrílicos Gipao punta pincel 12 colores");
    expect(
      normalizeSuggestedProductName("Lindo set de notas adhesivas pastel x10"),
    ).toBe("Set de notas adhesivas pastel x10");
    expect(normalizeSuggestedProductName("Lámina de stickers BTS")).toBe(
      "Lámina de stickers BTS",
    );
  });

  it("las licencias quedan con su grafía oficial aunque vengan en minúscula", () => {
    expect(
      normalizeSuggestedProductName("Libreta flower power Happy Thoughts"),
    ).toBe("Libreta Flower Power Happy Thoughts");
    expect(normalizeSuggestedProductName("Stickers HELLO KITTY x2")).toBe(
      "Stickers Hello Kitty x2",
    );
    expect(normalizeSuggestedProductName("Cartuchera power bank")).toBe(
      "Cartuchera power bank",
    );
  });
});
