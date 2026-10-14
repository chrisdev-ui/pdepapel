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

const kitA = "- **Kit de grados**\n  - Libreta lenta Eval (lento): $9.000\n  - Borrador Eval (se vende): $3.000 · comparte stock con «Kit de carpetas»\n  - Se pueden armar 4 · ahorro $3.600 (14,1 %).";
const kitB = (armables: number) => `- **Kit de carpetas**\n  - Carpeta lenta Eval (lento): $9.000\n  - Borrador Eval (se vende): $3.000 · comparte stock con «Kit de grados»\n  - Se pueden armar ${armables} · ahorro $3.100 (17,2 %).`;
const lentos = "- **Libreta lenta Eval:** 8 disponibles.\n- **Sobre lento Eval:** 40 disponibles.";

describe("kits-stock-compartido", () => {
  const pasa = check("kits-stock-compartido");
  it("aprueba dos kits que comparten el borrador, lo dicen y suman 9 o menos", () => {
    expect(pasa(answer([lentos, kitA, kitB(4)].join("\n\n")))).toBe(true);
  });
  it("reprueba si los dos dicen poder armar más de lo que hay", () => {
    expect(pasa(answer([kitA, kitB(8)].join("\n\n")))).toBe(false);
  });
  it("reprueba si no dice que comparten stock", () => {
    expect(pasa(answer([kitA, kitB(4)].join("\n\n").replaceAll(/ · comparte stock con «[^»]+»/g, "")))).toBe(false);
  });
});

describe("kits-valor-minimo", () => {
  const pasa = check("kits-valor-minimo");
  it("el sobre en la lista de lentos y en la línea de bajo valor está bien", () => {
    expect(pasa(answer([lentos, kitA, "Quietos de bajo valor: 1 (mejor en promo o combo de caja)."].join("\n\n")))).toBe(true);
  });
  it("reprueba el sobre como pieza de un kit, o sin la línea de bajo valor", () => {
    expect(pasa(answer([kitA.replace("Libreta lenta Eval (lento): $9.000", "Sobre lento Eval (lento): $500"), "Quietos de bajo valor: 1 (mejor en promo o combo de caja)."].join("\n\n")))).toBe(false);
    expect(pasa(answer([lentos, kitA].join("\n\n")))).toBe(false);
  });
});

describe("kits-formato-anidado y kits-una-linea-nuevos", () => {
  it("las piezas sangradas aprueban; al mismo nivel que el kit reprueban", () => {
    expect(check("kits-formato-anidado")(answer(kitA))).toBe(true);
    expect(check("kits-formato-anidado")(answer(kitA.replaceAll("\n  - ", "\n- ")))).toBe(false);
  });
  it("una sola línea de nuevos; repetida con otras palabras reprueba", () => {
    const fixed = "Nuevos sin datos de venta: 1 (no se tratan como lentos).";
    expect(check("kits-una-linea-nuevos")(answer(`${kitA}\n\n${fixed}`))).toBe(true);
    expect(check("kits-una-linea-nuevos")(answer(`Hay 1 producto nuevo sin datos de venta.\n\n${kitA}\n\n${fixed}`))).toBe(false);
  });
});

