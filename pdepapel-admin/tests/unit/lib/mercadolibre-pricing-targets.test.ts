import { describe, expect, it } from "vitest";

import {
  parseMercadoLibreMinNetPerUnit,
  parseMercadoLibreTargetMarginPercent,
} from "@/lib/store-settings";

describe("Mercado Libre pricing targets in store settings", () => {
  it("leaves the field untouched when the form does not send it", () => {
    expect(parseMercadoLibreTargetMarginPercent(undefined)).toBeUndefined();
    expect(parseMercadoLibreMinNetPerUnit(undefined)).toBeUndefined();
  });

  it("accepts a percentage between 0 and 60 and a whole COP amount", () => {
    expect(parseMercadoLibreTargetMarginPercent("20")).toBe(20);
    expect(parseMercadoLibreTargetMarginPercent(12.5)).toBe(12.5);
    expect(parseMercadoLibreTargetMarginPercent("")).toBe(0);
    expect(parseMercadoLibreMinNetPerUnit("10.000")).toBe(10_000);
    expect(parseMercadoLibreMinNetPerUnit(0)).toBe(0);
  });

  it("rejects what would make every suggestion impossible or nonsense", () => {
    expect(() => parseMercadoLibreTargetMarginPercent(61)).toThrow(/entre 0 y 60/);
    expect(() => parseMercadoLibreTargetMarginPercent(-1)).toThrow(/entre 0 y 60/);
    expect(() => parseMercadoLibreTargetMarginPercent("veinte")).toThrow();
    expect(() => parseMercadoLibreMinNetPerUnit(10_000.5)).toThrow(/entero/);
    expect(() => parseMercadoLibreMinNetPerUnit(-5)).toThrow(/entero/);
  });
});
