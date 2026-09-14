import { describe, expect, it } from "vitest";

import { describePhoneNumber } from "@/lib/phone-display";

/**
 * Formas exactas en que están guardados los teléfonos de Conversaciones hoy
 * (dígitos sin «+», con indicativo), con los últimos dígitos cambiados.
 * Si alguna vez volvieran a guardarse de otra manera, esto lo delata.
 */
const STORED_SHAPES = [
  { stored: "573024680000", country: "CO", shown: "+57 302 4680000" },
  { stored: "573115550000", country: "CO", shown: "+57 311 5550000" },
  { stored: "8613800130000", country: "CN", shown: "+86 138 0013 0000" },
];

describe("teléfonos tal como llegan de WhatsApp", () => {
  it.each(STORED_SHAPES)(
    "muestra $stored como $shown ($country)",
    ({ stored, country, shown }) => {
      const phone = describePhoneNumber(stored);

      expect(phone.isValid).toBe(true);
      expect(phone.country).toBe(country);
      expect(phone.international).toBe(shown);
    },
  );

  it("nombra el país en español", () => {
    expect(describePhoneNumber("573024680000").countryName).toBe("Colombia");
    expect(describePhoneNumber("8613800130000").countryName).toBe("China");
  });
});
