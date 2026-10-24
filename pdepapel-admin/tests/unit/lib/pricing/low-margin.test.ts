import { describe, expect, it } from "vitest";

import { classifyLowMargin, compareLowMargin, sectionOf, type LowMarginInput } from "@/lib/pricing/low-margin";

const product = (overrides: Partial<LowMarginInput>): LowMarginInput => ({
  id: "p",
  name: "Lapicero",
  categoryName: "Bolígrafos",
  price: 10_000,
  effectivePrice: 10_000,
  offerLabel: null,
  cost: 6_000,
  isKit: false,
  ...overrides,
});

describe("clases de «Margen bajo» (mínimo 40 % antes de Bold)", () => {
  it("llega al 40 % antes de Bold pero no con el fijo de Bold en una sola unidad: «solo por Bold»", () => {
    const row = classifyLowMargin(product({}), 40);
    expect(row).toMatchObject({ clase: "solo-bold", margenPct: 40, margenBoldPct: 25.7, precioOferta: null, costo: 6_000 });
    expect(sectionOf(row)).toBe("solo-bold");
  });

  it("llega al 40 % incluso después de Bold: no aparece", () => {
    const row = classifyLowMargin(product({ price: 20_000, effectivePrice: 20_000 }), 40);
    expect(row.clase).toBe("cumple");
    expect(sectionOf(row)).toBeNull();
  });

  it("bajo 40 % antes de Bold", () => {
    expect(classifyLowMargin(product({ price: 9_000, effectivePrice: 9_000 }), 40)).toMatchObject({ clase: "bajo-minimo", margenPct: 33.3 });
  });

  it("bajo el costo con el precio normal", () => {
    expect(classifyLowMargin(product({ price: 5_000, effectivePrice: 5_000 }), 40).clase).toBe("bajo-costo");
  });

  it("una oferta que deja bajo el costo un producto que con su precio normal lo cubre", () => {
    const row = classifyLowMargin(product({ price: 8_000, effectivePrice: 5_000, offerLabel: "Feria" }), 40);
    expect(row).toMatchObject({ clase: "oferta-bajo-costo", precio: 8_000, precioOferta: 5_000, oferta: "Feria" });
    expect(sectionOf(row)).toBe("oferta-bajo-costo");
  });

  it("si ya estaba bajo el costo sin la oferta, es «bajo el costo»", () => {
    expect(classifyLowMargin(product({ price: 5_000, effectivePrice: 4_000 }), 40).clase).toBe("bajo-costo");
  });

  it("vender justo al costo no es «bajo el costo»", () => {
    expect(classifyLowMargin(product({ price: 6_000, effectivePrice: 6_000 }), 40).clase).toBe("bajo-minimo");
  });

  it("el precio para el mínimo es el …900 más bajo antes de Bold; con Bold, el de una sola unidad", () => {
    const row = classifyLowMargin(product({ price: 9_000, effectivePrice: 9_000 }), 40);
    expect(row.precioParaMinimo).toBe(10_900);
    expect(row.precioParaMinimoConBold).toBe(12_900);
  });

  it("sin costo no se evalúa", () => {
    const row = classifyLowMargin(product({ cost: null }), 40);
    expect(row).toMatchObject({ clase: "sin-costo", margenPct: null, margenBoldPct: null, precioParaMinimo: null });
    expect(sectionOf(row)).toBeNull();
  });

  it("sin mínimo en Configuración solo cuenta lo que está bajo el costo", () => {
    expect(classifyLowMargin(product({ price: 9_000, effectivePrice: 9_000 }), null).clase).toBe("cumple");
    expect(classifyLowMargin(product({ price: 5_000, effectivePrice: 5_000 }), null).clase).toBe("bajo-costo");
    expect(classifyLowMargin(product({}), null).precioParaMinimo).toBeNull();
  });

  it("un kit va siempre a «Kits», con su clase", () => {
    const kit = classifyLowMargin(product({ isKit: true, price: 9_000, effectivePrice: 9_000 }), 40);
    expect(kit.clase).toBe("bajo-minimo");
    expect(sectionOf(kit)).toBe("kits");
    expect(sectionOf(classifyLowMargin(product({ isKit: true, price: 20_000, effectivePrice: 20_000 }), 40))).toBe("kits");
  });

  it("el peor margen primero y, a igual margen, por nombre", () => {
    const rows = [
      classifyLowMargin(product({ id: "b", name: "Borrador", price: 9_000, effectivePrice: 9_000 }), 40),
      classifyLowMargin(product({ id: "a", name: "Agenda", price: 9_000, effectivePrice: 9_000 }), 40),
      classifyLowMargin(product({ id: "c", name: "Cartuchera", price: 7_000, effectivePrice: 7_000 }), 40),
    ];
    expect([...rows].sort(compareLowMargin).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});
