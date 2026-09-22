import { describe, expect, it } from "vitest";

import {
  IGNORE_REASON_MIN_LENGTH,
  matchesIgnoredContact,
  normalizeIgnoredBsuid,
  normalizeIgnoredPhone,
  validateIgnoreReason,
} from "@/lib/whatsapp/ignored-contacts";

const CHUCHU = { phone: "8618858869228", bsuid: "CN.1377520137782797" };

/**
 * El emparejamiento de la lista de ignorados.
 *
 * Es lo más delicado de la función entera: una coincidencia de más deja a una
 * clienta real sin respuesta y sin que nadie se entere, porque el mensaje no
 * llega ni al panel. Por eso todo es exacto y estas pruebas insisten en los
 * casi-iguales.
 */
describe("a quién tapa una regla", () => {
  it("tapa por teléfono exacto", () => {
    expect(matchesIgnoredContact([{ phone: CHUCHU.phone, bsuid: null }], { phone: CHUCHU.phone })).toBe(true);
  });

  it("tapa por BSUID exacto aunque no haya teléfono", () => {
    expect(matchesIgnoredContact([{ phone: null, bsuid: CHUCHU.bsuid }], { bsuid: CHUCHU.bsuid })).toBe(true);
  });

  it("una regla con las dos identidades tapa viniendo por cualquiera", () => {
    const regla = [{ phone: CHUCHU.phone, bsuid: CHUCHU.bsuid }];
    expect(matchesIgnoredContact(regla, { phone: CHUCHU.phone })).toBe(true);
    expect(matchesIgnoredContact(regla, { bsuid: CHUCHU.bsuid })).toBe(true);
  });

  describe("lo que NO puede tapar nunca", () => {
    const regla = [{ phone: CHUCHU.phone, bsuid: CHUCHU.bsuid }];

    it("un número que solo comparte el principio", () => {
      // El indicativo de China entero: si esto emparejara, se caería medio país.
      expect(matchesIgnoredContact(regla, { phone: "86" })).toBe(false);
      expect(matchesIgnoredContact(regla, { phone: "861885886922" })).toBe(false);
    });

    it("un número que lo contiene o lo extiende", () => {
      expect(matchesIgnoredContact(regla, { phone: "18618858869228" })).toBe(false);
      expect(matchesIgnoredContact(regla, { phone: "86188588692280" })).toBe(false);
    });

    it("un BSUID con el mismo prefijo de país", () => {
      expect(matchesIgnoredContact(regla, { bsuid: "CN." })).toBe(false);
      expect(matchesIgnoredContact(regla, { bsuid: "CN.1377520137782798" })).toBe(false);
    });

    it("un número colombiano cualquiera", () => {
      expect(matchesIgnoredContact(regla, { phone: "573116164568" })).toBe(false);
    });

    it("una identidad vacía", () => {
      expect(matchesIgnoredContact(regla, {})).toBe(false);
      expect(matchesIgnoredContact(regla, { phone: null, bsuid: null })).toBe(false);
      expect(matchesIgnoredContact(regla, { phone: "" })).toBe(false);
    });

    /** Una regla vacía taparía a todo el mundo: es la peor falla posible. */
    it("una regla sin teléfono ni BSUID no tapa a nadie", () => {
      expect(matchesIgnoredContact([{ phone: null, bsuid: null }], { phone: "573116164568" })).toBe(false);
      expect(matchesIgnoredContact([{ phone: "", bsuid: "" }], { phone: "573116164568" })).toBe(false);
    });

    it("sin reglas no se tapa nada", () => {
      expect(matchesIgnoredContact([], { phone: CHUCHU.phone })).toBe(false);
    });
  });

  it("el teléfono se compara ya normalizado, venga como venga escrito", () => {
    const regla = [{ phone: CHUCHU.phone, bsuid: null }];
    expect(matchesIgnoredContact(regla, { phone: "+86 188 5886 9228" })).toBe(true);
    expect(matchesIgnoredContact(regla, { phone: "+86-188-5886-9228" })).toBe(true);
  });
});

describe("normalizar identidades", () => {
  it("el teléfono se queda en dígitos", () => {
    expect(normalizeIgnoredPhone("+57 311 616 4568")).toBe("573116164568");
    expect(normalizeIgnoredPhone("   ")).toBeNull();
    expect(normalizeIgnoredPhone(null)).toBeNull();
    expect(normalizeIgnoredPhone("abc")).toBeNull();
  });

  it("el BSUID no se toca, solo se recorta", () => {
    // Lleva punto y mayúsculas; quitárselos lo rompería.
    expect(normalizeIgnoredBsuid("  CN.1377520137782797 ")).toBe("CN.1377520137782797");
    expect(normalizeIgnoredBsuid("")).toBeNull();
  });
});

describe("el motivo es obligatorio", () => {
  it("rechaza lo vacío y lo demasiado corto", () => {
    expect(validateIgnoreReason("")).toBeNull();
    expect(validateIgnoreReason("   ")).toBeNull();
    expect(validateIgnoreReason("spam")).toBeNull();
    expect(validateIgnoreReason(undefined)).toBeNull();
    expect(validateIgnoreReason(42)).toBeNull();
  });

  it("acepta y limpia un motivo de verdad", () => {
    const largo = "x".repeat(IGNORE_REASON_MIN_LENGTH);
    expect(validateIgnoreReason(largo)).toBe(largo);
    expect(validateIgnoreReason("  manda    cientos de mensajes  ")).toBe("manda cientos de mensajes");
  });

  it("recorta lo larguísimo en vez de rechazarlo", () => {
    expect(validateIgnoreReason("y".repeat(900))).toHaveLength(500);
  });
});
