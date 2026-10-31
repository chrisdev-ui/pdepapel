import { describe, expect, it } from "vitest";

import { packageProblem, parsePackageRows, productPackageOf } from "@/lib/product-package";

describe("paquete real del producto", () => {
  it("solo cuenta como medido con las cuatro medidas", () => {
    expect(productPackageOf({ packageWeightGrams: 450, packageHeightCm: 5, packageWidthCm: 20, packageLengthCm: 25 })).toEqual({
      weightGrams: 450,
      heightCm: 5,
      widthCm: 20,
      lengthCm: 25,
    });
    expect(productPackageOf({ packageWeightGrams: 450, packageHeightCm: 5, packageWidthCm: null, packageLengthCm: 25 })).toBeNull();
    expect(productPackageOf({})).toBeNull();
  });

  it("rechaza pesos fuera de rango o con decimales y lados fuera de 1–150 cm", () => {
    expect(packageProblem({ weightGrams: 0, heightCm: 5, widthCm: 5, lengthCm: 5 })).toMatch(/peso/);
    expect(packageProblem({ weightGrams: 12.5, heightCm: 5, widthCm: 5, lengthCm: 5 })).toMatch(/peso/);
    expect(packageProblem({ weightGrams: 300, heightCm: 0.5, widthCm: 5, lengthCm: 5 })).toMatch(/alto/);
    expect(packageProblem({ weightGrams: 300, heightCm: 5, widthCm: 5, lengthCm: 151 })).toMatch(/largo/);
    expect(packageProblem({ weightGrams: 300, heightCm: 5, widthCm: 5, lengthCm: 5 })).toBeNull();
  });

  it("lee filas pegadas con coma, tabulador o punto y coma, con unidades y decimales con coma", () => {
    const text = [
      "SKU, peso, alto, ancho, largo",
      "# medidas de Paula",
      "RES-CLS-MUL-M-P-3170, 320, 4, 18, 22",
      "PLU-CLS-MUL-M-P-7669\t410 g\t3,5 cm\t20\t24",
      "ORG-CLS-MUL-L-P-5318; 950; 9,5; 26; 30",
      "",
    ].join("\n");
    const { rows, problems } = parsePackageRows(text);
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { sku: "RES-CLS-MUL-M-P-3170", weightGrams: 320, heightCm: 4, widthCm: 18, lengthCm: 22 },
      { sku: "PLU-CLS-MUL-M-P-7669", weightGrams: 410, heightCm: 3.5, widthCm: 20, lengthCm: 24 },
      { sku: "ORG-CLS-MUL-L-P-5318", weightGrams: 950, heightCm: 9.5, widthCm: 26, lengthCm: 30 },
    ]);
  });

  it("informa filas incompletas, valores inválidos y SKU repetidos sin descartar el resto en silencio", () => {
    const { rows, problems } = parsePackageRows(["A-1, 300, 4, 18", "A-2, 0, 4, 18, 22", "A-3, 300, 4, 18, 22", "A-3, 310, 4, 18, 22"].join("\n"));
    expect(rows.map((row) => row.sku)).toEqual(["A-3"]);
    expect(problems).toEqual([
      "línea 1: se esperaban 5 valores (SKU, peso g, alto, ancho, largo cm)",
      expect.stringContaining("línea 2 (A-2): el peso"),
      "línea 4: A-3 está repetido",
    ]);
  });
});
