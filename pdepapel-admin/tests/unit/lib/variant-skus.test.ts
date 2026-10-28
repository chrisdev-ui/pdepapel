import { describe, expect, it, vi } from "vitest";

import { generateSemanticSKU, skuSuffix } from "@/lib/variant-generator";
import { generateUniqueVariantSku } from "@/lib/variant-skus";

/** Números «aleatorios» fijos: cada llamada devuelve el siguiente de la lista. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe("SKU de variante: cola de 6 en base 36 y reintento si choca", () => {
  it("la cola tiene 6 caracteres de 0-9A-Z", () => {
    expect(skuSuffix(sequence(0))).toBe("000000");
    expect(skuSuffix(sequence(0.999))).toBe("ZZZZZZ");
    expect(generateSemanticSKU("Colores", "Aesthetic", "Blanco", "S-L", sequence(0.5))).toBe("COL-AES-BLA-S-L-IIIIII");
  });

  it("si el primero ya existe en la base, genera otro; si choca con uno de este mismo guardado, también", async () => {
    // 1.º: «000000» (existe en la base) · 2.º: «111111» (ya repartido en este guardado) · 3.º: «222222» libre.
    const random = sequence(...Array(6).fill(0), ...Array(6).fill(1 / 36), ...Array(6).fill(2 / 36));
    const findUnique = vi.fn(async ({ where }: { where: { sku: string } }) => (where.sku.endsWith("000000") ? { id: "otro" } : null));
    const taken = new Set(["COL-AES-BLA-S-L-111111"]);
    const sku = await generateUniqueVariantSku({ product: { findUnique } } as never, {
      categoryName: "Colores",
      designName: "Aesthetic",
      colorName: "Blanco",
      sizeName: "S-L",
      taken,
      random,
    });
    expect(sku).toBe("COL-AES-BLA-S-L-222222");
    expect(taken.has(sku)).toBe(true);
  });

  it("si nunca encuentra uno libre, no adivina: 409", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "otro" });
    await expect(
      generateUniqueVariantSku({ product: { findUnique } } as never, { categoryName: "A", designName: "B", colorName: "C", sizeName: "D", taken: new Set(), random: sequence(0) }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
