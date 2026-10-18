import { describe, expect, it } from "vitest";

import { buildBrandMatcher, describeBrandMatch } from "@/lib/brand-matcher";

const match = buildBrandMatcher([
  { id: "scribe", name: "Scribe", aliases: ["Incolors"] },
  { id: "norma", name: "Norma", aliases: [] },
  { id: "flower", name: "Flower Power", aliases: [] },
]);

describe("buscar marcas en el nombre", () => {
  it("encuentra Scribe por el alias Incolors, sin tildes ni mayúsculas", () => {
    const [hit] = match("Cuaderno INCOLORS tapa dura");
    expect(hit).toMatchObject({ brandId: "scribe", via: "alias", term: "Incolors" });
    expect(describeBrandMatch(hit)).toBe("coincide por el alias «Incolors»");
  });

  it("prefiere el nombre cuando dice las dos cosas", () => {
    expect(match("Colores Scribe Incolors x15")).toEqual([
      { brandId: "scribe", brandName: "Scribe", via: "name", term: "Scribe" },
    ]);
  });

  it("solo palabras completas", () => {
    expect(match("Agenda Normandía")).toEqual([]);
    expect(match("Cuaderno flower-power 5 materias")[0]?.brandId).toBe("flower");
  });

  it("devuelve todas las marcas cuando hay más de una", () => {
    expect(match("Cuaderno Norma Scribe").map((hit) => hit.brandId).sort()).toEqual(["norma", "scribe"]);
  });
});
