// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { composeKitsAnswer, type KitData, type KitsAnswerData } from "../../../lib/copiloto/skills/kits-answer";
import { KITS_CASES, renderedKits } from "../../../scripts/copilot-eval/questions";

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
  n: name === "Kit de grados" ? 1 : 2,
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
  criterios: { diasSinVenta: 90, precioMinimoPiezaLenta: 5000 },
  totalLentos: 3,
  plataQuietaACostoTotal: 30000,
  lentosSinCosto: 0,
  lentos: [
    { nombre: "Libreta lenta Eval", disponible: 8, plataQuietaACosto: 24000, ultimaVenta: "hace 120 días" },
    { nombre: "Sobre lento Eval", disponible: 40, plataQuietaACosto: 6000, ultimaVenta: "hace 150 días" },
  ],
  nuevosSinDatosDeVenta: { cantidad: 1 },
  quietosDeBajoValor: {
    cantidad: lowValue,
    nombres: lowValue ? ["Sobre lento Eval"] : [],
    productos: lowValue ? [{ nombre: "Sobre lento Eval", precioEfectivo: 150, motivo: "precio unitario bajo" }] : [],
  },
  kits,
});
/** Lo que el modelo manda a `textosDeKits`. */
const MODEL = {
  kits: [
    { n: 1, nombreCorto: "Kit de grados", loQueAmaras: ["Algo bonito", "Algo útil"], idealPara: null },
    { n: 2, nombreCorto: "Kit de carpetas", loQueAmaras: ["Orden", "Color"], idealPara: null },
  ],
};
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
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 30 % [[tag:margen bajo (meta 35 %)]] · alcanza para 4 kits", 35))).toBe(true);
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 50 % [[tag:margen bajo (meta 35 %)]] · alcanza para 4 kits", 35))).toBe(false);
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 30 % [[tag:margen bajo]] · alcanza para 4 kits", 35))).toBe(false);
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 30 % [[tag:margen bajo (meta 40 %)]] · alcanza para 4 kits", 35))).toBe(false);
    expect(check("kits-margen-bajo")(withTool("**$10.900** · margen 30 % · alcanza para 4 kits", 35))).toBe(false);
  });
});

describe("respuesta de producción del 2026-10-16, pintada", () => {
  // La respuesta real: el modelo no dejó textos que sirvieran para ningún kit.
  const MODEL_OUTPUT = null;
  const piece = (nombre: string, rol: string) => ({ nombre, rol, precioEfectivo: 9000 });
  const kit = (nombreSugerido: string, ocasion: string, n: number, lenta: string): KitData => ({
    nombreSugerido,
    ocasion,
    n,
    piezas: [piece(lenta, "lento"), piece(`Cuaderno ${n}`, "se vende"), piece(`Lápiz ${n}`, "se vende")],
    kitsArmables: 3,
    sumaPreciosEfectivos: 27000,
    precioSugerido: 23900,
    ahorroPct: 11.5,
    margenPct: 30,
    margenBajo: true,
  });
  const datos: KitsAnswerData = {
    criterios: { diasSinVenta: 90, margenCriterioPanelPct: 35, precioMinimoPiezaLenta: 5000 },
    totalLentos: 3,
    plataQuietaACostoTotal: 90000,
    lentos: [],
    kits: [
      kit("Kit Plumones Primavera", "Útiles escolares", 1, "Set de plumones Prueba"),
      kit("Kit Cartucheras Totto", "Útiles escolares", 2, "Cartuchera Prueba"),
      kit("Kit Regalo Snoopy", "Regalo", 3, "Maleta conejito Prueba"),
    ],
  };
  // Lo que se vio en el chat: solo el último kit con bloque, y adentro la nota del modelo con «:::detalle».
  const BROKEN = [
    "## 3 kits sugeridos",
    "### ✏️ Kit Útiles escolares con Set de plumones Prueba doble punta pincel y fina 24 colores",
    "**$23.900** · margen 30 % [[tag:margen bajo]] · alcanza para 3 kits",
    "### ✏️ Kit Útiles escolares con Cartuchera Prueba de tres compartimentos con cremallera",
    "**$23.900** · margen 30 % [[tag:margen bajo]] · alcanza para 3 kits",
    "### 🎁 Kit Regalo con Maleta conejito Prueba para niñas con ruedas y manija",
    "**$23.900** · margen 30 % [[tag:margen bajo]] · alcanza para 3 kits",
    ":::copiar Texto para la ficha",
    "La maleta conejito Prueba no alcanza para armar tres kits con el mínimo de unidades. :::detalle Para tener en cuenta",
    "- Con 2 disponibles se arman solo 2 kits.",
    ":::",
  ].join("\n");

  it("la respuesta rota de producción reprueba las tres comprobaciones de pantalla", () => {
    const tool = { kits: 3, margenCriterioPanelPct: 35, conMargenBajo: 3 };
    const result = renderedKits(BROKEN, tool);
    expect(result.copiaPorKit).toBe(false);
    expect(result.nombresCortosYDistintos).toBe(false);
    expect(result.margenBajoConMeta).toBe(false);
    expect(renderedKits(`${BROKEN}\n[[KIT-1]] suelto`, tool).sinFugas).toBe(true);
  });

  it("la misma salida del modelo, armada ahora, aprueba: un texto por kit con sus piezas, sin fugas y con nombres cortos", () => {
    const text = composeKitsAnswer(datos, MODEL_OUTPUT);
    expect(renderedKits(text, { kits: 3, margenCriterioPanelPct: 35, conMargenBajo: 3 })).toEqual({ kits: 3, copiaPorKit: true, sinFugas: true, nombresCortosYDistintos: true, margenBajoConMeta: true, copiasDelModelo: 0 });
  });

  it("la meta del tag tiene que ser el criterio que usó la herramienta, y solo en los kits marcados", () => {
    const text = composeKitsAnswer(datos, MODEL_OUTPUT);
    expect(renderedKits(text, { kits: 3, margenCriterioPanelPct: 40, conMargenBajo: 3 }).margenBajoConMeta).toBe(false);
    expect(renderedKits(text, { kits: 3, margenCriterioPanelPct: 35, conMargenBajo: 2 }).margenBajoConMeta).toBe(false);
    expect(renderedKits(text, { kits: 3, conMargenBajo: 3 }).margenBajoConMeta).toBe(false);
    const withoutLow = composeKitsAnswer({ ...datos, kits: datos.kits!.map((kit) => ({ ...kit, margenPct: 50, margenBajo: false })) }, MODEL_OUTPUT);
    expect(renderedKits(withoutLow, { kits: 3, margenCriterioPanelPct: 35, conMargenBajo: 0 }).margenBajoConMeta).toBe(true);
  });

  it("nombres de la re-prueba en vivo (dos empiezan igual) reprueban; armados ahora, el código los separa", () => {
    const tool = { kits: 3, margenCriterioPanelPct: 35, conMargenBajo: 3 };
    const liveRecheck = ["## 3 kits sugeridos", "### ✏️ Kit Útiles escolares con escritura", "### ✏️ Kit Útiles escolares", "### 🎁 Kit Regalo con accesorios"].join("\n");
    expect(renderedKits(liveRecheck, tool).nombresCortosYDistintos).toBe(false);
    const recomposed = composeKitsAnswer({ ...datos, kits: [kit("Kit Útiles escolares con escritura", "Útiles escolares", 1, "A"), kit("Kit Útiles escolares", "Útiles escolares", 2, "B"), kit("Kit Regalo con accesorios", "Regalo", 3, "C")] }, null);
    expect(renderedKits(recomposed, tool).nombresCortosYDistintos).toBe(true);
    const fromModel = composeKitsAnswer(datos, { kits: [1, 2, 3].map((n) => ({ n, nombreCorto: `Kit número ${n}`, loQueAmaras: ["Uno", "Dos"], idealPara: null })) });
    expect(renderedKits(fromModel, { kits: 3, margenCriterioPanelPct: 35, conMargenBajo: 3 }).copiasDelModelo).toBe(3);
  });
});
