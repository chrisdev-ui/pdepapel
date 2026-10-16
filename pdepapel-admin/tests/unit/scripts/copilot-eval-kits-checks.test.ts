import { describe, expect, it } from "vitest";

import { composeKitsAnswer, type KitData, type KitsAnswerData } from "../../../lib/copiloto/skills/kits-answer";
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

/** Respuestas con la forma real: las arma el mismo código que el chat. Valores de prueba. */
const kit = (name: string, slow: string, armables: number, shares: string): KitData => ({
  nombreSugerido: name,
  ocasion: null,
  marcador: name === "Kit de grados" ? "[[KIT-1]]" : "[[KIT-2]]",
  piezas: [
    { nombre: slow, rol: "lento", precioEfectivo: 9000 },
    { nombre: "Borrador Eval", rol: "se vende", precioEfectivo: 3000, comparteStockCon: [shares] },
  ],
  kitsArmables: armables,
  sumaPreciosEfectivos: 12000,
  precioSugerido: 10900,
  ahorroPct: 9.2,
  margenPct: 50,
  margenBajo: false,
  señales: [`${slow}: 120 días sin venderse`],
});
const datos = (kits: KitData[], lowValue = 1): KitsAnswerData => ({
  criterios: { diasSinVenta: 90 },
  totalLentos: 3,
  plataQuietaACostoTotal: 30000,
  lentosSinCosto: 0,
  lentos: [
    { nombre: "Libreta lenta Eval", disponible: 8, plataQuietaACosto: 24000, ultimaVenta: "hace 120 días" },
    { nombre: "Sobre lento Eval", disponible: 40, plataQuietaACosto: 6000, ultimaVenta: "hace 150 días" },
  ],
  nuevosSinDatosDeVenta: { cantidad: 1 },
  quietosDeBajoValor: { cantidad: lowValue, nombres: lowValue ? ["Sobre lento Eval"] : [] },
  kits,
});
const MODEL = "[[KIT-1]] Kit de grados\n✨ Lo que amarás\n- Algo\n📦 Incluye: Libreta y Borrador\n[[KIT-2]] Kit de carpetas\n📦 Incluye: Carpeta y Borrador";
const kitA = kit("Kit de grados", "Libreta lenta Eval", 4, "Kit de carpetas");
const kitB = (armables: number) => kit("Kit de carpetas", "Carpeta lenta Eval", armables, "Kit de grados");

describe("kits-stock-compartido", () => {
  const pasa = check("kits-stock-compartido");
  it("aprueba dos kits que comparten el borrador, lo dicen y suman 9 o menos", () => {
    expect(pasa(answer(composeKitsAnswer(datos([kitA, kitB(4)]), MODEL)))).toBe(true);
  });
  it("reprueba si los dos dicen poder armar más de lo que hay", () => {
    expect(pasa(answer(composeKitsAnswer(datos([kitA, kitB(8)]), MODEL)))).toBe(false);
  });
  it("reprueba si no dice que comparten stock", () => {
    expect(pasa(answer(composeKitsAnswer(datos([kitA, kitB(4)]), MODEL).replaceAll(/\n {2}- comparte stock con «[^»]+»/g, "")))).toBe(false);
  });
});

describe("kits-valor-minimo", () => {
  const pasa = check("kits-valor-minimo");
  it("el sobre en la lista de quietos y en las notas de bajo valor está bien", () => {
    expect(pasa(answer(composeKitsAnswer(datos([kitA]), MODEL)))).toBe(true);
  });
  it("reprueba el sobre como pieza de un kit, o sin la nota de bajo valor", () => {
    expect(pasa(answer(composeKitsAnswer(datos([kit("Kit de grados", "Sobre lento Eval", 4, "Kit de carpetas")]), MODEL)))).toBe(false);
    expect(pasa(answer(composeKitsAnswer(datos([kitA], 0), MODEL)))).toBe(false);
  });
});

describe("kits-formato, kits-una-linea-nuevos, kits-sin-jerga y kits-montos-de-la-herramienta", () => {
  it("la respuesta armada pasa el formato; la vieja (viñetas planas) no", () => {
    expect(check("kits-formato")(answer(composeKitsAnswer(datos([kitA]), MODEL)))).toBe(true);
    expect(check("kits-formato")(answer("- **Kit de grados**\n  - Libreta lenta Eval (lento): $9.000\n  - Se pueden armar 4 · ahorro $3.600 (14,1 %)."))).toBe(false);
  });
  it("una sola línea de nuevos; repetida con otras palabras reprueba", () => {
    const text = composeKitsAnswer(datos([kitA]), MODEL);
    expect(check("kits-una-linea-nuevos")(answer(text))).toBe(true);
    expect(check("kits-una-linea-nuevos")(answer(`Hay 1 producto nuevo sin datos de venta.\n\n${text}`))).toBe(false);
  });
  it("sin jerga: un nombre de herramienta o «(lento)» reprueba", () => {
    const text = composeKitsAnswer(datos([kitA]), MODEL);
    expect(check("kits-sin-jerga")(answer(text))).toBe(true);
    expect(check("kits-sin-jerga")(answer(`Según kitsParaRotar…\n${text}`))).toBe(false);
    expect(check("kits-sin-jerga")(answer("Libreta (lento): $9.000"))).toBe(false);
  });
  it("cada monto sale de la herramienta; uno recalculado reprueba", () => {
    const tool = { tool: "kitsParaRotar", output: { datos: datos([kitA]) } };
    const text = composeKitsAnswer(datos([kitA]), MODEL);
    const withTool = (body: string) => ({ ...answer(body), main: { ...answer(body).main, toolOutputs: [tool] } });
    expect(check("kits-montos-de-la-herramienta")(withTool(text))).toBe(true);
    expect(check("kits-montos-de-la-herramienta")(withTool(text.replace("$10.900", "$10.899")))).toBe(false);
  });
  it("«margen bajo» solo debajo del criterio del panel", () => {
    const tool = (pct: number) => ({ tool: "kitsParaRotar", output: { datos: { criterios: { margenCriterioPanelPct: pct } } } });
    const withTool = (body: string, pct: number) => ({ ...answer(body), main: { ...answer(body).main, toolOutputs: [tool(pct)] } });
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 30 % [[tag:margen bajo]] · alcanza para 4 kits", 35))).toBe(true);
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 50 % [[tag:margen bajo]] · alcanza para 4 kits", 35))).toBe(false);
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 30 % · alcanza para 4 kits", 35))).toBe(false);
  });
});
