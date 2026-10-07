import { describe, expect, it } from "vitest";

import { describeVariant, describeVariantBeyondName } from "@/lib/product-variant";

describe("describeVariant", () => {
  it("joins color, size and design and skips placeholder values", () => {
    expect(describeVariant({ color: { name: "Rosa pastel" }, size: { name: "S" }, design: { name: "Único" } })).toBe("Rosa pastel · S");
    expect(describeVariant({ color: { name: "N/A" }, size: null })).toBeNull();
  });

  it("keeps the color even when the name already carries it (labels print the full line)", () => {
    expect(describeVariant({ color: { name: "Azul pastel" }, size: { name: "M" } })).toBe("Azul pastel · M");
  });
});

/**
 * Issue #2: en el selector de producto la fila decía «Carpetas Flores Azul
 * pastel · Azul pastel · M · Flores»; lo que ya dice el nombre no se repite.
 */
describe("describeVariantBeyondName", () => {
  it("drops the attributes the name already says, accent and case insensitive", () => {
    expect(
      describeVariantBeyondName({ name: "Carpetas Flores Azul pastel", color: { name: "Azul pastel" }, size: { name: "M" }, design: { name: "Flores" } }),
    ).toBe("M");
    expect(describeVariantBeyondName({ name: "Cuaderno CORAZÓN rosa", color: { name: "Rosa" }, design: { name: "Corazon" } })).toBeNull();
  });

  it("only matches whole words: size «S» survives the «s» of «Carpetas»", () => {
    expect(describeVariantBeyondName({ name: "Carpetas Flores", size: { name: "S" } })).toBe("S");
    expect(describeVariantBeyondName({ name: "Lapicero Rosado", color: { name: "Rosa" } })).toBe("Rosa");
  });

  it("keeps the whole variant when the name says none of it", () => {
    expect(describeVariantBeyondName({ name: "Cartuchera Wisdom", color: { name: "Rosa pastel" }, size: { name: "S" } })).toBe("Rosa pastel · S");
    expect(describeVariantBeyondName({ name: "Agenda Hogwarts" })).toBeNull();
  });
});
