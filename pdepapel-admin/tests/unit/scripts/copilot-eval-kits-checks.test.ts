import { describe, expect, it } from "vitest";

import { KITS_CASES } from "../../../scripts/copilot-eval/questions";

/** Las comprobaciones de la evaluación de kits, sin llamar al modelo: también tienen que reprobar lo que deben reprobar. */
const check = (id: string) => KITS_CASES.find((item) => item.id === id)!.pasa;
const answer = (text: string) => ({
  main: { text, tools: ["kitsParaRotar"], skillsLoaded: ["kits"], found: [] },
  followUp: { text: "", tools: [], skillsLoaded: [], found: [] },
  empty: { text: "", tools: [], skillsLoaded: [], found: [] },
  expectedOccasion: null,
});

describe("kits-precio-efectivo", () => {
  const pasa = check("kits-precio-efectivo");

  it("aprueba el lápiz con su precio de oferta suelto", () => {
    expect(pasa(answer("- Lápiz HB Eval (se vende): $4.000 con la oferta «Eval» (antes $5.000)"))).toBe(true);
  });

  it("reprueba si el 4.000 solo aparece dentro de otro monto ($24.000)", () => {
    expect(pasa(answer("Kit con Lápiz HB Eval y la libreta: $24.000 quietos a costo, precio $21.900."))).toBe(false);
  });

  it("reprueba el precio de lista sin el de oferta", () => {
    expect(pasa(answer("- Lápiz HB Eval: $5.000"))).toBe(false);
  });
});

describe("kits-en-alza", () => {
  const pasa = check("kits-en-alza");

  it("aprueba cuando dice que el marcador va en alza", () => {
    expect(pasa(answer("Por qué: Marcador en alza Eval: en alza: 6 unidades en 30 días contra 1 antes."))).toBe(true);
    expect(pasa(answer("El marcador está creciendo: se vende más este mes."))).toBe(true);
  });

  it("reprueba si «marcador» y «en alza» quedan en líneas distintas", () => {
    expect(pasa(answer("Piezas: libreta y marcador.\nLas ventas van en alza este mes."))).toBe(false);
  });

  it("reprueba si solo aparece el nombre del producto, que ya trae «en alza»", () => {
    expect(pasa(answer("📦 Incluye: Libreta lenta Eval, Lápiz HB Eval y Marcador en alza Eval."))).toBe(false);
  });
});
