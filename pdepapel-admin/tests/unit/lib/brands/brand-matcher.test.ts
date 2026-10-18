import { describe, expect, it } from "vitest";

import { buildBrandMatcher, describeBrandMatch, preferLines } from "@/lib/brand-matcher";

const match = buildBrandMatcher([
  { id: "scribe", name: "Scribe", aliases: [] },
  { id: "incolors", name: "Incolors", aliases: [], parentBrandId: "scribe" },
  { id: "klipp", name: "Klipp", aliases: ["Fashion"] },
  { id: "norma", name: "Norma", aliases: [] },
  { id: "primavera", name: "Primavera", aliases: [] },
  { id: "flower", name: "Flower Power", aliases: [], parentBrandId: "primavera" },
]);

describe("buscar marcas en el nombre", () => {
  it("encuentra Klipp por el alias Fashion, sin tildes ni mayúsculas", () => {
    const [hit] = match("Morral FASHION estampado");
    expect(hit).toMatchObject({ brandId: "klipp", via: "alias", term: "Fashion" });
    expect(describeBrandMatch(hit)).toBe("coincide por el alias «Fashion»");
  });

  it("prefiere el nombre cuando dice el nombre y un alias", () => {
    expect(match("Morral Klipp Fashion")).toEqual([{ brandId: "klipp", brandName: "Klipp", via: "name", term: "Klipp" }]);
  });

  it("con una línea y su marca madre en el texto, queda solo la línea", () => {
    expect(match("Colores Scribe Incolors x15")).toEqual([
      { brandId: "incolors", brandName: "Incolors", via: "name", term: "Incolors" },
    ]);
    expect(match("Libreta Primavera Flower Power").map((hit) => hit.brandId)).toEqual(["flower"]);
    expect(match("Agenda Scribe").map((hit) => hit.brandId)).toEqual(["scribe"]);
    expect(match("Block Primavera").map((hit) => hit.brandId)).toEqual(["primavera"]);
  });

  it("solo palabras completas", () => {
    expect(match("Agenda Normandía")).toEqual([]);
    expect(match("Cuaderno flower-power 5 materias")[0]?.brandId).toBe("flower");
  });

  it("devuelve todas las marcas sin parentesco cuando hay más de una", () => {
    expect(match("Cuaderno Norma Scribe").map((hit) => hit.brandId).sort()).toEqual(["norma", "scribe"]);
  });

  it("preferLines no quita a la madre si coincide una línea de otra marca", () => {
    const parents = new Map<string, string | null>([["incolors", "scribe"], ["scribe", null], ["norma", null]]);
    expect(preferLines([{ brandId: "norma" }, { brandId: "incolors" }], parents).map((hit) => hit.brandId)).toEqual(["norma", "incolors"]);
    expect(preferLines([{ brandId: "scribe" }, { brandId: "incolors" }], parents).map((hit) => hit.brandId)).toEqual(["incolors"]);
  });
});
