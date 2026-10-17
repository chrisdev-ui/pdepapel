import type { TextStreamPart, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: vi.fn() }));

import type { CopilotDb } from "@/lib/copiloto/db";
import { composeBelowMarginAnswer, composePacksAnswer, composePriceAnswer } from "@/lib/copiloto/skills/precios-answer";
import { computeBelowMargin, computePacks, computePrice, withRealFee } from "@/lib/copiloto/skills/precios-tool";
import type { FeeQuoter } from "@/lib/mercadolibre/fee-quote";
import { pricingAnswerTransform } from "@/lib/copiloto/skills/precios-transform";

/** Valores de prueba: ninguna cifra del negocio. */
const STORE = {
  storeMinMarginPercent: 35 as number | null,
  mercadoLibreTargetMarginPercent: 20,
  mercadoLibreMinNetPerUnit: 10000,
  mercadoLibreLowPriceFixedFee: null as number | null,
  mercadoLibreFreeShippingMin: null as number | null,
  freeShippingThreshold: 150000 as number | null,
};
const product = (id: string, name: string, categoryId: string, price: number, acqPrice: number | null, isKit = false) => ({
  id,
  name,
  sku: null,
  categoryId,
  price,
  acqPrice,
  transportationCost: null,
  isKit,
});
const PRODUCTS = [
  product("c1", "Cuaderno argollado azul", "cuadernos", 15000, 10000),
  product("c2", "Cuaderno argollado rosa", "cuadernos", 16000, 10000),
  product("c3", "Cuaderno cosido", "cuadernos", 18000, 10000),
  product("c4", "Cuaderno pasta dura", "cuadernos", 20000, 10000),
  product("c5", "Cuaderno pequeño", "cuadernos", 25000, 10000),
  product("s1", "Sticker brillante", "stickers", 1000, 700),
  product("k1", "Kit cuadernos", "cuadernos", 60000, null, true),
];
const CATEGORIES = [
  { id: "cuadernos", name: "Cuadernos", typeId: "papeleria", markupOverridePercent: null, type: { name: "Papelería" } },
  { id: "stickers", name: "Stickers", typeId: "decoracion", markupOverridePercent: null, type: { name: "Decoración" } },
];

type Linked = { listingType: string; categoryId: string; connectionId: string; connection: { siteId: string } } | null;

function fakeDb(store = STORE, shippingCosts = [8000, 9000, 12000, 0], linked: Linked = null): CopilotDb {
  return {
    marketplaceListing: { findFirst: async () => linked },
    store: { findUnique: async () => store },
    product: { findMany: async () => PRODUCTS },
    category: { findMany: async () => CATEGORIES },
    order: { findMany: async () => shippingCosts.map((_, index) => ({ id: `o${index}` })) },
    shipping: { findMany: async () => shippingCosts.filter((cost) => cost > 0).map((cost) => ({ cost })) },
    orderItem: { findMany: async () => [{ productId: "c1", quantity: 4 }, { productId: "c1", quantity: 2 }] },
  } as unknown as CopilotDb;
}

const noQuote: FeeQuoter = async () => null;
const price = async (db: CopilotDb, input: Parameters<typeof computePrice>[2], quote: FeeQuoter = noQuote) => withRealFee(await computePrice(db, "store", input), quote);

/** Cada monto «$N» de la respuesta es un número de la salida de la herramienta. */
function amountsComeFromTool(text: string, output: unknown) {
  const numbers = new Set<number>();
  const walk = (value: unknown) => {
    if (typeof value === "number") numbers.add(Math.abs(Math.round(value)));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(output);
  const amounts = Array.from(text.matchAll(/\$([\d.]+)/g), (match) => Number(match[1].replace(/\./g, "")));
  expect(amounts.length).toBeGreaterThan(0);
  for (const amount of amounts) expect(numbers.has(amount), `$${amount}`).toBe(true);
}

describe("compararPacks: el caso de 150 unidades a 150", () => {
  it("la respuesta trae la escalera, la ganancia, las mezclas y la recomendación, y cada monto sale de la herramienta", async () => {
    const result = await computePacks(fakeDb(), "store", { costoUnitario: 150, disponible: 150, tamanos: [10, 20, 30], preciosPorPack: [{ tamano: 10, precio: 8000 }] });
    const text = composePacksAnswer(result);
    expect(text).toContain("el pack de **10 deja más ganancia en total** ($97.500 si vendes los 15)");
    expect(text).toContain("Empieza con **x10 y x20**: de x20 y x30 salen pocos packs.");
    expect(text).toContain("### x20 · $14.900 [[tag:sugerido]]\n**$11.900 de ganancia** · 79,9 % sobre el precio · $745 por unidad (6,9 % menos) · 7 packs y sobran 10");
    expect(text).toContain("### x30 · $20.900 [[tag:sugerido]]");
    expect(text).toContain("1. Mayor ganancia: 15 × x10 → $97.500\n2. Mitad y mitad: 7 × x10 + 4 × x20 → $93.100\n3. Menos packs: 1 × x10 + 7 × x20 → $89.800");
    expect(text).toContain("- Sin costo de empaque: la ganancia no lo descuenta.");
    expect(text).toContain("- Revisa en 2 a 3 semanas con lo que se haya vendido.");
    expect(text).toContain("[[tag:estimado, sin cargo fijo]]");
    expect(text).toContain("Es margen bruto, antes de la comisión de la pasarela de pago.");
    amountsComeFromTool(text, result);
  });

  it("un pack más barato que el envío típico se marca como complemento", async () => {
    const result = await computePacks(fakeDb(STORE, [20000, 20000, 20000]), "store", { costoUnitario: 150, disponible: 150, tamanos: [10, 20], preciosPorPack: [{ tamano: 10, precio: 8000 }] });
    expect(result.datos.envioTipico).toEqual({ mediana: 20000, pedidos: 3 });
    expect(composePacksAnswer(result)).toContain("x10 cuesta menos que el envío típico ($20.000): mejor como complemento de otra compra. [[tag:se vende como complemento]]");
  });

  it("sin precio de Paula, el más pequeño sale del aumento sugerido y lo dice", async () => {
    const result = await computePacks(fakeDb(), "store", { costoUnitario: 150, disponible: 60, tamanos: [10, 20], subcategoria: "cuadernos" });
    expect(result.datos.entradas.precioBase).toEqual({ tamano: 10, aumentoPct: 80, fuente: "mediana de Cuadernos (5 productos)" });
    expect(result.datos.tamanos[0].price).toBe(2700);
    expect(composePacksAnswer(result)).toContain("Sin precio tuyo: x10 sale del aumento de 80 % (mediana de Cuadernos (5 productos)).");
  });
});

describe("calcularPrecio", () => {
  it("usa la mediana de la subcategoría del producto parecido, compara con el mínimo y trae los parecidos con sus ventas", async () => {
    const result = await price(fakeDb(), { costoUnitario: 4500, parecidoA: "cuaderno argollado" });
    expect(result.datos.tienda).toMatchObject({ precioSugerido: 8100, aumentoPct: 80, fuente: "mediana de Cuadernos (5 productos)", margenPct: 44.4, minimo: { margenPct: 35, precio: 6924 } });
    const text = composePriceAnswer(result);
    expect(text).toContain("el precio sugerido para la tienda es **$8.100**, con margen del 44,4 % sobre el precio.");
    expect(text).toContain("Aumento de 80 % sobre el costo: mediana de Cuadernos (5 productos).");
    expect(text).toContain("Cumple el mínimo de la tienda (35 %); el precio más bajo que lo cumple es $6.924.");
    expect(text).toContain("1. Cuaderno argollado azul · $15.000 · margen 33,3 % · 6 vendidas en 30 días");
    expect(text).toContain("[[tag:estimado, sin cargo fijo]]");
    expect(text).toContain("No me diste: envío por unidad ni empaque.");
    expect(text).not.toMatch(/IVA/);
    amountsComeFromTool(text, result);
  });

  it("con los ajustes de Mercado Libre: hasta el límite cargo fijo sin envío; por encima envío sin cargo fijo; ya no dice «sin cargo fijo»", async () => {
    const low = await price(fakeDb({ ...STORE, mercadoLibreLowPriceFixedFee: 900, mercadoLibreFreeShippingMin: 60000 }), { costoUnitario: 4500, canal: "mercadolibre" });
    expect(low.datos.tienda).toBeNull();
    expect(low.datos.mercadolibre?.opciones.map((option) => option.estimado)).toMatchObject([
      { fixedFee: 900, shipping: 0, withoutFixedFee: false, commissionPct: 16 },
      { fixedFee: 900, shipping: 0, withoutFixedFee: false, commissionPct: 19 },
    ]);
    const lowText = composePriceAnswer(low);
    expect(lowText).toContain("cargo fijo $900");
    expect(lowText).not.toMatch(/envío \$/);
    expect(lowText).toContain("[[tag:estimado]]");
    expect(lowText).not.toContain("sin cargo fijo");

    const high = await price(fakeDb({ ...STORE, mercadoLibreLowPriceFixedFee: 900, mercadoLibreFreeShippingMin: 10000 }), { costoUnitario: 4500, canal: "mercadolibre" });
    expect(high.datos.mercadolibre?.opciones[0].estimado).toMatchObject({ fixedFee: 0, shipping: 8100 });
    expect(composePriceAnswer(high)).toContain("envío $8.100");
    expect(composePriceAnswer(high)).not.toContain("cargo fijo $");
    amountsComeFromTool(composePriceAnswer(low), low);
  });

  it("sin publicación vinculada muestra las dos comisiones, 16 % sin cuotas extra y 19 % con cuotas extra", async () => {
    const result = await price(fakeDb(), { costoUnitario: 6000, canal: "mercadolibre" });
    expect(result.datos.mercadolibre?.vinculado).toBeNull();
    expect(result.datos.mercadolibre?.opciones.map((option) => [option.tipo, option.estimado?.commissionPct])).toEqual([
      ["gold_special", 16],
      ["gold_pro", 19],
    ]);
    const text = composePriceAnswer(result);
    expect(text).toContain("No tiene publicación vinculada: van las dos opciones, según ofrezcas cuotas extra o no.");
    expect(text).toMatch(/Clásica, sin cuotas extra: \*\*\$[\d.]+\*\* · comisión \$[\d.]+ \(16 %\)/);
    expect(text).toMatch(/Premium, con cuotas extra: \*\*\$[\d.]+\*\* · comisión \$[\d.]+ \(19 %\)/);
    expect(text).toContain("16 % sin cuotas extra (Clásica) y 19 % con cuotas extra (Premium)");
    amountsComeFromTool(text, result);
  });

  it("con publicación vinculada usa su tipo y, si Mercado Libre responde, la comisión real; si no, el estimado y lo dice", async () => {
    const linked = { listingType: "gold_pro", categoryId: "MCO1", connectionId: "conn", connection: { siteId: "MCO" } };
    const asked: unknown[] = [];
    const real: FeeQuoter = async (request) => {
      asked.push(request);
      return { kind: "real", percentageFee: 17.5, fixedFee: 0, listingType: "gold_pro" };
    };
    const withQuote = await price(fakeDb(STORE, undefined, linked), { costoUnitario: 6000, parecidoA: "cuaderno argollado azul", canal: "mercadolibre" }, real);
    expect(asked).toEqual([expect.objectContaining({ connectionId: "conn", siteId: "MCO", categoryId: "MCO1", listingType: "gold_pro" })]);
    expect(withQuote.datos.mercadolibre).toMatchObject({ comisionReal: true, vinculado: { tipo: "gold_pro" } });
    expect(withQuote.datos.mercadolibre?.opciones).toHaveLength(1);
    expect(withQuote.datos.mercadolibre?.opciones[0].estimado).toMatchObject({ commissionPct: 17.5, commissionKind: "real" });
    expect(withQuote.datos).not.toHaveProperty("cotizar");
    const text = composePriceAnswer(withQuote);
    expect(text).toContain("Su publicación es Premium (con cuotas extra), con la comisión real de Mercado Libre.");
    expect(text).toContain("(17,5 %)");

    const failed = await price(fakeDb(STORE, undefined, linked), { costoUnitario: 6000, parecidoA: "cuaderno argollado azul", canal: "mercadolibre" });
    expect(failed.datos.mercadolibre).toMatchObject({ comisionReal: false });
    expect(failed.datos.mercadolibre?.opciones[0].estimado).toMatchObject({ commissionPct: 19, commissionKind: "tipo" });
    expect(composePriceAnswer(failed)).toContain("no pude consultar la comisión real, va la estimada.");
  });

  it("sin margen mínimo lo dice; los precios de mercado de Paula dan la posición", async () => {
    const result = await price(fakeDb({ ...STORE, storeMinMarginPercent: null }), { costoUnitario: 4500, subcategoria: "cuadernos", preciosMercado: [9000, 7000], canal: "tienda" });
    const text = composePriceAnswer(result);
    expect(text).toContain("No tienes un margen mínimo configurado en Configuración.");
    expect(text).toContain("Los precios que me diste van de $7.000 a $9.000. **$8.100 queda dentro.**");
    expect(text).toContain("## Otros productos de Cuadernos");
  });
});

describe("margenesBajoMinimo", () => {
  it("por umbral y subcategoría, con el precio para llegar y lo que no se evaluó", async () => {
    const result = await computeBelowMargin(fakeDb(), "store", { margenes: [35, 40] });
    const text = composeBelowMarginAnswer(result);
    expect(text).toContain("- Por debajo del 35 %: **2 productos** de 6 en 2 subcategorías.");
    expect(text).toContain("- Por debajo del 40 %: **3 productos** de 6 en 2 subcategorías.");
    expect(text).toContain("### Cuadernos · 2 de 5");
    expect(text).toContain("Cuaderno argollado azul: $15.000 → **$15.385** (hoy 33,3 %)");
    expect(text).toContain("- 1 kit no entra: se evalúan por sus piezas.");
    expect(text).toContain("- Tu margen mínimo hoy es 35 % (Configuración).");
    amountsComeFromTool(text, result);
  });

  it("sin porcentaje ni mínimo en Configuración, pide el margen", async () => {
    const result = await computeBelowMargin(fakeDb({ ...STORE, storeMinMarginPercent: null }), "store", {});
    expect(composeBelowMarginAnswer(result)).toContain("No tienes un margen mínimo en Configuración. Dime qué margen quieres revisar");
  });
});

describe("la respuesta de precios la arma el código", () => {
  it("descarta el texto del modelo y pone la respuesta compuesta al final", async () => {
    const result = await computeBelowMargin(fakeDb(), "store", { margenes: [35] });
    const parts = [
      { type: "text-start", id: "a" },
      { type: "text-delta", id: "a", text: "Voy a revisar." },
      { type: "text-end", id: "a" },
      { type: "tool-result", toolName: "margenesBajoMinimo", output: result },
      { type: "text-start", id: "b" },
      { type: "text-delta", id: "b", text: "Hay 3 productos a $1." },
      { type: "text-end", id: "b" },
      { type: "finish" },
    ] as unknown as TextStreamPart<ToolSet>[];
    const stream = new ReadableStream<TextStreamPart<ToolSet>>({
      start(controller) {
        parts.forEach((part) => controller.enqueue(part));
        controller.close();
      },
    }).pipeThrough(pricingAnswerTransform<ToolSet>()({ tools: {} as ToolSet, stopStream: () => undefined }));
    const out: TextStreamPart<ToolSet>[] = [];
    for await (const part of stream as unknown as AsyncIterable<TextStreamPart<ToolSet>>) out.push(part);
    const text = out.filter((part) => part.type === "text-delta").map((part) => (part as { text: string }).text);
    expect(text).toEqual(["Voy a revisar.", composeBelowMarginAnswer(result)]);
    expect(out.at(-1)?.type).toBe("finish");
  });

  it("con la habilidad cargada retiene el texto del paso: se descarta si llama a la herramienta y sale igual si no", async () => {
    const result = await computeBelowMargin(fakeDb(), "store", { margenes: [35] });
    const run = async (parts: unknown[]) => {
      const stream = new ReadableStream<TextStreamPart<ToolSet>>({
        start(controller) {
          (parts as TextStreamPart<ToolSet>[]).forEach((part) => controller.enqueue(part));
          controller.close();
        },
      }).pipeThrough(pricingAnswerTransform<ToolSet>({ hold: () => true })({ tools: {} as ToolSet, stopStream: () => undefined }));
      const out: TextStreamPart<ToolSet>[] = [];
      for await (const part of stream as unknown as AsyncIterable<TextStreamPart<ToolSet>>) out.push(part);
      return out.filter((part) => part.type === "text-delta").map((part) => (part as { text: string }).text);
    };
    expect(
      await run([
        { type: "text-start", id: "a" },
        { type: "text-delta", id: "a", text: "Son 9 a $1." },
        { type: "text-end", id: "a" },
        { type: "tool-call", toolName: "margenesBajoMinimo", toolCallId: "c", input: {} },
        { type: "tool-result", toolName: "margenesBajoMinimo", toolCallId: "c", output: result },
        { type: "finish-step" },
        { type: "finish" },
      ]),
    ).toEqual([composeBelowMarginAnswer(result)]);
    expect(await run([{ type: "text-start", id: "a" }, { type: "text-delta", id: "a", text: "¿Cuánto te costó?" }, { type: "text-end", id: "a" }, { type: "finish-step" }, { type: "finish" }])).toEqual(["¿Cuánto te costó?"]);
  });
});
