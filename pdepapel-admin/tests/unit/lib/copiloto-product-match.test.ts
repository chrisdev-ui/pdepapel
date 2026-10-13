import { describe, expect, it } from "vitest";

import { countConcreteFacts, decideProduct, matchTokens, normalizeQuantities, singular, skuLikeTokens, type MatchCandidate } from "@/lib/copiloto/skills/product-match";

const product = (name: string, category = "Marcadores", group: string | null = null, sku = `SKU-${name.length}`): MatchCandidate => ({
  id: name,
  name,
  sku,
  category,
  group,
});

const CATALOG = [
  product("Set Marcadores Estuche 50 Colores"),
  product("Marcadores en estuche x24 Offi-esco"),
  product("Marcadores doble punta x36 ETERNA"),
  product("Set en estuche de plumones Offi-Esco punta pincel 24 colores", "Plumones"),
  product("Portalápiz cuadrado pastel", "Organizadores"),
];

describe("palabras de búsqueda", () => {
  it("quita tildes, mayúsculas y palabras vacías, y pasa a singular", () => {
    expect(matchTokens("Hazme la descripción de los MARCADORES en estuches")).toEqual(["marcador", "estuche"]);
    expect(singular("colores")).toBe("color");
    expect(singular("plumones")).toBe("plumon");
    expect(singular("estuches")).toBe("estuche");
    expect(singular("50")).toBe("50");
  });

  it.each(["x50", "x 50", "por 50", "50 unidades", "50 colores"])("«%s» es 50", (text) => {
    expect(matchTokens(normalizeQuantities(text))).toEqual(["50"]);
  });
});

describe("decideProduct", () => {
  it("la frase de Paula llega al producto aunque esté escrito distinto", () => {
    expect(decideProduct("marcadores en estuche cuadrado x50", CATALOG)).toEqual({ kind: "match", product: CATALOG[0] });
    expect(decideProduct("hazme la descripción de los marcadores en estuche cuadrado x50", CATALOG)).toEqual({ kind: "match", product: CATALOG[0] });
  });

  it("empate arriba: pregunta cuál, con hasta 5 candidatos", () => {
    const twins = [product("Cartuchera Eval Rosa", "Cartucheras"), product("Cartuchera Eval Azul", "Cartucheras")];
    expect(decideProduct("la cartuchera eval", twins)).toEqual({ kind: "ambiguous", candidates: twins });
    expect(decideProduct("cartuchera eval rosa", twins)).toEqual({ kind: "match", product: twins[0] });
  });

  it("si dijo una cantidad que no existe no adivina: muestra los 3 más parecidos", () => {
    const decision = decideProduct("marcadores en estuche x100", CATALOG);
    expect(decision.kind).toBe("none");
    expect(decision.kind === "none" && decision.closest.map((row) => row.name)).toEqual([
      "Set Marcadores Estuche 50 Colores",
      "Marcadores en estuche x24 Offi-esco",
      "Marcadores doble punta x36 ETERNA",
    ]);
  });

  it("sin palabras en común no encuentra nada", () => {
    expect(decideProduct("agenda 2027 tapa dura", CATALOG)).toEqual({ kind: "none", closest: [] });
    expect(decideProduct("", CATALOG)).toEqual({ kind: "none", closest: [] });
  });

  it("un desactivado que empata con un activo se pregunta, con su estado", () => {
    const active = { ...product("Set en caja de marcadores acrílicos GIPAO punta pincel profesional 12 colores"), estado: "activo" };
    const archived = { ...product("Marcadores acrílicos punta pincel x60"), estado: "desactivado" };
    const decision = decideProduct("marcadores acrílicos punta pincel", [active, archived]);
    expect(decision.kind).toBe("ambiguous");
    expect(decision.kind === "ambiguous" && decision.candidates.map((row) => row.estado).sort()).toEqual(["activo", "desactivado"]);
  });

  it("una cantidad que contradice la del producto le baja el puntaje", () => {
    const active = { ...product("Set en caja de marcadores acrílicos GIPAO punta pincel profesional 12 colores"), estado: "activo" };
    const archived = { ...product("Marcadores acrílicos punta pincel x60"), estado: "desactivado" };
    expect(decideProduct("marcadores acrílicos punta pincel x60", [active, archived])).toEqual({ kind: "match", product: archived });
    expect(decideProduct("marcadores acrílicos punta pincel 12 colores", [active, archived])).toEqual({ kind: "match", product: active });
  });

  it("reconoce lo que tiene forma de SKU", () => {
    expect(skuLikeTokens("hazme la descripción de MAR-SIM-MUL-L-L-6315, porfa")).toEqual(["MAR-SIM-MUL-L-L-6315"]);
    expect(skuLikeTokens("ev-a1b2c3 y lib-kaw-123")).toEqual(["LIB-KAW-123"]);
    expect(skuLikeTokens("marcadores doble-punta x36")).toEqual([]);
  });

  it("también encuentra por el grupo y por el SKU", () => {
    const rows = [product("Variante rosa", "Libretas", "Libretas Kawaii"), product("Otra cosa", "Libretas", null, "LIB-KAW-123")];
    expect(decideProduct("libretas kawaii rosa", rows)).toEqual({ kind: "match", product: rows[0] });
    expect(decideProduct("lib-kaw-123", rows)).toEqual({ kind: "match", product: rows[1] });
  });
});

describe("countConcreteFacts", () => {
  it("cuenta por familia, más marca, kit y hasta dos usos", () => {
    expect(countConcreteFacts({ texts: ["Borrador Eval", "<p>Borrador blanco.</p>"] })).toBe(1);
    expect(countConcreteFacts({ texts: ["Regla de 30 cm"] })).toBe(1);
    expect(countConcreteFacts({ texts: ["Cartuchera Eval Rosa", "<p>Cartuchera de tela con cierre metálico y dos compartimentos, de 20 x 8 cm, para guardar lápices.</p>"] })).toBe(5);
    expect(countConcreteFacts({ texts: ["Set de plumígrafos 8 colores", "punta de 0,7 mm y tinta a base de agua, para dibujo lineal y para lettering"], brand: "WORKPAL" })).toBe(7);
    expect(countConcreteFacts({ texts: ["Kit escolar", "Kit para el colegio."], kitPieces: 2 })).toBe(2);
    expect(countConcreteFacts({ texts: ["Marcadores en estuche x24 Offi-esco"] })).toBe(2);
  });
});
