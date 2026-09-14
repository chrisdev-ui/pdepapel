import { describe, expect, it } from "vitest";

import { describePhoneNumber, getPhoneCountryLabel } from "@/lib/phone-display";

describe("describePhoneNumber", () => {
  it("interpreta el formato que entrega WhatsApp, sin «+»", () => {
    // Este es el caso real: así llegan los 20 teléfonos de Conversaciones.
    const result = describePhoneNumber("573024686403");

    expect(result).toMatchObject({
      e164: "+573024686403",
      country: "CO",
      countryName: "Colombia",
      international: "+57 302 4686403",
      national: "302 4686403",
      isValid: true,
    });
  });

  it("reconoce un número extranjero y lo nombra", () => {
    // En producción hay uno chino entre las conversaciones.
    const result = describePhoneNumber("8613800138000");

    expect(result.country).toBe("CN");
    expect(result.countryName).toBe("China");
    expect(result.isValid).toBe(true);
  });

  it("acepta el mismo número ya en E.164", () => {
    expect(describePhoneNumber("+573024686403")).toMatchObject({
      country: "CO",
      international: "+57 302 4686403",
      isValid: true,
    });
  });

  it("asume Colombia cuando el número viene local", () => {
    expect(describePhoneNumber("3024686403")).toMatchObject({
      e164: "+573024686403",
      country: "CO",
      isValid: true,
    });
  });

  it("tolera espacios, guiones y paréntesis", () => {
    expect(describePhoneNumber(" (302) 468-6403 ").e164).toBe("+573024686403");
  });

  it("no inventa un país cuando el número es ilegible", () => {
    const result = describePhoneNumber("12345");

    expect(result.isValid).toBe(false);
    // El dato original nunca se pierde: la tabla lo muestra tal cual.
    expect(result.raw).toBe("12345");
  });

  it("devuelve vacío para null, undefined y espacios", () => {
    for (const value of [null, undefined, "   "]) {
      expect(describePhoneNumber(value)).toMatchObject({
        e164: null,
        country: null,
        isValid: false,
      });
    }
  });

  it("no confunde un local de 10 dígitos con un internacional", () => {
    // Sin la regla de prioridad, «+3024686403» parecería un número de otro país.
    expect(describePhoneNumber("3024686403").country).toBe("CO");
  });
});

describe("getPhoneCountryLabel", () => {
  it("prefiere el nombre del país y cae al código", () => {
    expect(getPhoneCountryLabel(describePhoneNumber("573024686403"))).toBe(
      "Colombia",
    );
    expect(getPhoneCountryLabel(describePhoneNumber("12345"))).toBeNull();
  });
});
