import { describe, expect, it } from "vitest";

import { looksLikeRandomName, normalizeMobile } from "@/lib/customer-checks";

/** Mismos casos que pdepapel-admin/tests/unit/lib/order-risk.test.ts: las dos copias no pueden separarse. */
describe("normalizeMobile", () => {
  it.each([
    ["3001234567", "+573001234567"],
    ["300 123 4567", "+573001234567"],
    ["+57 300 123 4567", "+573001234567"],
    ["57 3001234567", "+573001234567"],
    ["(301) 555-0001", "+573015550001"],
    ["0057 3001112233", "+573001112233"],
  ])("acepta el celular colombiano %s", (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
  });

  it.each(["+57 9123456789", "9123456789", "601 2345678", "300123456", "300123456789", "", "abc"])(
    "rechaza %s (fijo, empieza por 9, largo malo o vacío)",
    (input) => {
      expect(normalizeMobile(input)).toBeNull();
    },
  );

  it("acepta un número de otro país con indicativo, porque una tarjeta la puede comprar alguien de fuera", () => {
    expect(normalizeMobile("+1 415 555 2671")).toBe("+14155552671");
    expect(normalizeMobile("+44 20 7946 0958")).toBe("+442079460958");
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

