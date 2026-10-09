import { describe, expect, it } from "vitest";

import { looksLikeRandomName, normalizeMobile } from "@/lib/customer-checks";

/** Mismos casos que pdepapel-admin/tests/unit/lib/order-risk.test.ts: las dos copias no pueden separarse. */
describe("normalizeMobile", () => {
  it.each([
    ["3001234567", "+573001234567"],
    ["300 123 4567", "+573001234567"],
    ["+57 300 123 4567", "+573001234567"],
    ["57 3001234567", "+573001234567"],
    ["(315) 555-0101", "+573155550101"],
    ["0057 3201234567", "+573201234567"],
  ])("acepta el celular colombiano %s", (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });

  it.each(["+57 9123456789", "9123456789", "601 2345678", "300123456", "30012345678", "", "abc"])(
    "rechaza %s (fijo, empieza por 9, largo malo o vacío)",
    (input) => {
      expect(normalizeMobile(input)).toBeNull();
    },
  );

  it("acepta un número de otro país con indicativo, porque una tarjeta la puede comprar alguien de fuera", () => {
    expect(normalizeMobile("+1 305 555 0101")).toBe("+13055550101");
    expect(normalizeMobile("+34 612 345 678")).toBe("+34612345678");
    expect(normalizeMobile("+1 23")).toBeNull();
  });
});

describe("looksLikeRandomName", () => {
  it.each([
    "Daniela",
    "maría josé",
    "Ana María De la Ossa",
    "Juan Pablo Ñáñez Gutiérrez",
    "José O'Neill",
    "Lucía Pérez-Rodríguez",
    "McDonald",
    "Hirschfeld",
    "Lyn",
    "Yhordy Mosquera",
  ])("no marca un nombre real: %s", (name) => {
    expect(looksLikeRandomName(name)).toBe(false);
  });

  it.each(["xKqPzLmWvB", "Bcdfghjk Prz", "QwRtYpLkJh", "Juan123", "zxcvbnmlk", "", "   "])(
    "marca letras al azar o con números: %s",
    (name) => {
      expect(looksLikeRandomName(name)).toBe(true);
    },
  );
});

