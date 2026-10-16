import { describe, expect, it } from "vitest";

import { parseMarkupOverridePercent, parseOptionalMercadoLibrePesos, parseStoreMinMarginPercent } from "@/lib/store-settings";

describe("ajustes de precios", () => {
  it("margen mínimo: ausente no toca, vacío es «sin mínimo», un decimal con coma o punto", () => {
    expect(parseStoreMinMarginPercent(undefined)).toBeUndefined();
    expect(parseStoreMinMarginPercent("")).toBeNull();
    expect(parseStoreMinMarginPercent(null)).toBeNull();
    expect(parseStoreMinMarginPercent("40")).toBe(40);
    expect(parseStoreMinMarginPercent("37,55")).toBe(37.6);
    expect(() => parseStoreMinMarginPercent("95")).toThrow(/entre 0 y 90/);
    expect(() => parseStoreMinMarginPercent("abc")).toThrow(/entre 0 y 90/);
  });

  it("cargo fijo y umbral de Mercado Libre: pesos enteros, vacío es «no registrado»", () => {
    expect(parseOptionalMercadoLibrePesos(undefined, "x")).toBeUndefined();
    expect(parseOptionalMercadoLibrePesos("", "x")).toBeNull();
    expect(parseOptionalMercadoLibrePesos("1.500", "x")).toBe(1500);
    expect(() => parseOptionalMercadoLibrePesos("12,5", "El cargo fijo")).toThrow(/El cargo fijo debe ser un número entero/);
  });

  it("aumento propio de una subcategoría: vacío vuelve a la mediana", () => {
    expect(parseMarkupOverridePercent(undefined)).toBeUndefined();
    expect(parseMarkupOverridePercent("")).toBeNull();
    expect(parseMarkupOverridePercent("85,5")).toBe(85.5);
    expect(() => parseMarkupOverridePercent("-1")).toThrow(/entre 0 y 1000/);
  });
});
