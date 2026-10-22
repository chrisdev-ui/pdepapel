import type { TextStreamPart, ToolSet } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store-access", () => ({ requireStoreOwner: vi.fn() }));

import type { CopilotDb } from "@/lib/copiloto/db";
import { composeKitPriceAnswer, NOT_SAVED, orderKitOptions, rotationLabel } from "@/lib/copiloto/skills/kit-price-answer";
import { priceKitOptions, type KitPriceLine } from "@/lib/pricing/kit-price";
import { computeKitPrice, KIT_PRICE_TOOL } from "@/lib/copiloto/skills/kit-price-tool";
import { PRICING_TOOLS } from "@/lib/copiloto/skills/precios-tool";
import { pricingAnswerTransform } from "@/lib/copiloto/skills/precios-transform";
import { getCopilotSkill } from "@/lib/copiloto/skills";

import { CAPIBARA_EXPECTED, CAPIBARA_PRODUCTS, PAULA_CAPIBARA_PIECES } from "../../helpers/capibara-kit";

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Una base falsa que aplica los filtros que manda el buscador (contains sin
 * tildes ni mayúsculas, como la intercalación de MySQL; AND, OR, archivado,
 * SKU, id), sobre los productos «capibara».
 */
type Row = (typeof ROWS)[number];
const ROWS = CAPIBARA_PRODUCTS.map((product, index) => ({
  id: `p${index}`,
  name: product.name,
  sku: product.sku,
  price: product.price,
  acqPrice: product.acqPrice as number | null,
  transportationCost: null as number | null,
  stock: product.stock,
  reservedUnits: 0,
  isKit: product.isKit,
  isArchived: product.isArchived,
  soldCount: 0,
  categoryId: `c-${product.category}`,
  productGroupId: null as string | null,
  category: { name: product.category },
}));

function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "storeId") return true;
    if (key === "AND") return (value as Record<string, unknown>[]).every((clause) => matches(row, clause));
    if (key === "OR") return (value as Record<string, unknown>[]).some((clause) => matches(row, clause));
    if (key === "category") return fold(row.category.name).includes(fold(((value as { name: { contains: string } }).name.contains)));
    if (value && typeof value === "object" && "contains" in (value as object)) return fold(String(row[key as keyof Row] ?? "")).includes(fold((value as { contains: string }).contains));
    if (value && typeof value === "object" && "in" in (value as object)) return ((value as { in: unknown[] }).in).includes(row[key as keyof Row]);
    return row[key as keyof Row] === value;
  });
}

function fakeDb(rows: Row[] = ROWS, minMargin: number | null = 40, kitComponents: { kitId: string; componentId: string; quantity: number }[] = []): CopilotDb {
  return {
    store: { findUnique: async () => ({ storeMinMarginPercent: minMargin, mercadoLibreTargetMarginPercent: 20, mercadoLibreMinNetPerUnit: 10000, mercadoLibreLowPriceFixedFee: null, mercadoLibreFreeShippingMin: null, freeShippingThreshold: null }) },
    product: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, where)),
    },
    productKit: {
      findMany: async ({ where }: { where: { kitId: string } }) =>
        kitComponents.filter((item) => item.kitId === where.kitId).map((item) => ({ quantity: item.quantity, component: rows.find((row) => row.id === item.componentId) ?? null })),
    },
    offer: { findMany: async () => [] },
    productPriceTier: { findMany: async () => [] },
  } as unknown as CopilotDb;
}

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

const pieces = (texts: readonly string[]) => texts.map((texto) => ({ texto, cantidad: 1 }));

describe("precioDeKit con el pedido de Paula del 2026-10-22 (capibara)", () => {
  it("resuelve 6 piezas, pregunta por las 3 ambiguas (cosedora = grapadora) y no da precios todavía", async () => {
    const result = await computeKitPrice(fakeDb(), "store", { piezas: pieces(PAULA_CAPIBARA_PIECES), paraRotar: true });
    const datos = result.datos as Extract<typeof result.datos, { estado: "aclarar" }>;
    expect(datos.estado).toBe("aclarar");
    expect(datos.piezas.map((piece) => piece.nombre)).toEqual([...CAPIBARA_EXPECTED.resueltas]);
    expect(datos.piezas.every((piece) => piece.transporteNoRegistrado)).toBe(true);
    const byText = Object.fromEntries(datos.aclarar.map((item) => [item.texto, item]));
    expect(byText["lapicero capibara"]).toMatchObject({ problema: "ambiguo" });
    expect(byText["lapicero capibara"].candidatos.map((candidate) => candidate.nombre).sort()).toEqual([...CAPIBARA_EXPECTED.ambiguas["lapicero capibara"]].sort());
    expect(byText["monedero capibara tela"].candidatos.map((candidate) => candidate.nombre)).toEqual([...CAPIBARA_EXPECTED.ambiguas["monedero capibara tela"]]);
    expect(byText["cosedora capibara"].candidatos.map((candidate) => candidate.nombre)).toEqual([...CAPIBARA_EXPECTED.ambiguas["cosedora capibara"]]);
    // Ningún producto archivado entra como candidato ni como pieza.
    expect(JSON.stringify(datos)).not.toMatch(/Lapicero capibara"|caritas|transparente/);
    expect("opciones" in datos).toBe(false);

    const text = composeKitPriceAnswer(result);
    expect(text).toContain("Encontré 6 de 9 piezas");
    expect(text).toContain("«lapicero capibara»: hay varios parecidos");
    expect(text).toContain("«cosedora capibara»: hay varios parecidos");
    expect(text).not.toMatch(/Opciones de precio|margen/);
  });

  it("con las piezas aclaradas da el precio, marca el transporte y, porque es para rotar, el precio para rotar", async () => {
    const chosen = [...CAPIBARA_EXPECTED.resueltas.map((name) => name), "Lapicero capibara eco", "MON-CAP-MUL-S-L-1587", "Grapadora Capibara"];
    const result = await computeKitPrice(fakeDb(), "store", { piezas: pieces(chosen), paraRotar: true });
    const datos = result.datos as Extract<typeof result.datos, { estado: "listo" }>;
    expect(datos.estado).toBe("listo");
    expect(datos.piezas).toHaveLength(9);
    expect(datos.sinTransporteDe).toHaveLength(9);
    expect(datos.opciones.some((option) => option.kinds.includes("rotar"))).toBe(true);
    expect(datos.opciones.filter((option) => !option.kinds.includes("rotar")).every((option) => option.margenBoldPct !== null)).toBe(true);

    const text = composeKitPriceAnswer(result);
    expect(text).toContain("## Opciones de precio");
    expect(text).toContain(rotationLabel(40));
    expect(text).toContain("Si pagan con Bold:");
    expect(text).toContain("[[tag:transporte no registrado]]");
    expect(text).toContain(NOT_SAVED);
    amountsComeFromTool(text, result);
  });

  it("sin intención de rotar nunca sale el precio para rotar", async () => {
    const result = await computeKitPrice(fakeDb(), "store", { piezas: pieces(["Llavero Capibara", "Rollo de stickers Capibara"]) });
    const datos = result.datos as Extract<typeof result.datos, { estado: "listo" }>;
    expect(datos.paraRotar).toBe(false);
    expect(datos.opciones.some((option) => option.kinds.includes("rotar"))).toBe(false);
    expect(composeKitPriceAnswer(result)).not.toContain("Precio para rotar");
  });

  it("una opción por debajo del 40 % después de Bold sale «no permitido»", async () => {
    const result = await computeKitPrice(fakeDb(), "store", { piezas: pieces(["Llavero Capibara", "Rollo de stickers Capibara"]), descuentoPct: 25 });
    const text = composeKitPriceAnswer(result);
    expect(text).toMatch(/no permitido \(menos del 40 %\)/);
  });

  it("una pieza sin costo: se lista, el kit queda sin margen y no se dice que cumple el mínimo", async () => {
    const rows = ROWS.map((row) => (row.name === "Pin Capibara" ? { ...row, acqPrice: 0 } : row));
    const result = await computeKitPrice(fakeDb(rows), "store", { piezas: pieces(["Pin Capibara", "Llavero Capibara"]) });
    const datos = result.datos as Extract<typeof result.datos, { estado: "listo" }>;
    expect(datos.costoTotal).toBeNull();
    expect(datos.opciones.every((option) => option.margenPct === null && option.permitido === null)).toBe(true);
    const text = composeKitPriceAnswer(result);
    expect(text).toContain("No tengo el costo de: Pin Capibara");
    expect(text).toContain("[[tag:sin costo]]");
    expect(text).not.toMatch(/margen \d|cumple tu mínimo de/);
  });

  it("un kit que ya existe se precia por sus piezas del panel; un producto que no es kit se dice", async () => {
    const kit = ROWS.find((row) => row.name === "Kit Capibara x5 (con medias)")!;
    const medias = ROWS.find((row) => row.name === "Medias Capibara")!;
    const llavero = ROWS.find((row) => row.name === "Llavero Capibara")!;
    const db = fakeDb(ROWS, 40, [
      { kitId: kit.id, componentId: medias.id, quantity: 1 },
      { kitId: kit.id, componentId: llavero.id, quantity: 2 },
    ]);
    const result = await computeKitPrice(db, "store", { kit: kit.sku });
    const datos = result.datos as Extract<typeof result.datos, { estado: "listo" }>;
    expect(datos.piezas.map((piece) => [piece.nombre, piece.cantidad])).toEqual([
      ["Medias Capibara", 1],
      ["Llavero Capibara", 2],
    ]);
    expect(datos.kitExistente).toMatchObject({ nombre: kit.name, precioActual: kit.price });
    expect(composeKitPriceAnswer(result)).toContain(`Hoy «${kit.name}» está en`);

    const notKit = await computeKitPrice(db, "store", { kit: "Llavero Capibara" });
    expect(composeKitPriceAnswer(notKit)).toContain("no es un kit en el panel");
  });

  it("una pieza que es un kit no entra: se pide nombrar sus piezas", async () => {
    const result = await computeKitPrice(fakeDb(), "store", { piezas: pieces(["Kit Capibara x5 (con mini libreta)", "Llavero Capibara"]) });
    const datos = result.datos as Extract<typeof result.datos, { estado: "aclarar" }>;
    expect(datos.aclarar[0]).toMatchObject({ problema: "es un kit" });
  });

  it("la entrada exige el kit o sus piezas, no los dos", async () => {
    await expect(computeKitPrice(fakeDb(), "store", { kit: "Kit Capibara", piezas: pieces(["Llavero Capibara"]) })).rejects.toThrow();
    await expect(computeKitPrice(fakeDb(), "store", {})).rejects.toThrow();
  });
});

describe("precioDeKit en el chat", () => {
  it("está en las habilidades de precios y de kits, y corta el chat como las demás de precios", () => {
    expect(getCopilotSkill("precios")!.herramientas).toContain(KIT_PRICE_TOOL);
    expect(getCopilotSkill("kits")!.herramientas).toContain(KIT_PRICE_TOOL);
    expect(PRICING_TOOLS).toContain(KIT_PRICE_TOOL);
    expect(getCopilotSkill("kits")!.instrucciones).toMatch(/precioDeKit/);
    expect(getCopilotSkill("precios")!.instrucciones).toMatch(/paraRotar/);
  });

  it("la respuesta armada reemplaza el texto del modelo, también lo que escribió antes de llamar la herramienta", async () => {
    const result = await computeKitPrice(fakeDb(), "store", { piezas: pieces(["Llavero Capibara", "Rollo de stickers Capibara"]) });
    const parts = [
      { type: "text-start", id: "t0" },
      { type: "text-delta", id: "t0", text: "Te sale en $1." },
      { type: "text-end", id: "t0" },
      { type: "tool-call", toolCallId: "c1", toolName: KIT_PRICE_TOOL, input: {} },
      { type: "tool-result", toolCallId: "c1", toolName: KIT_PRICE_TOOL, output: result },
      { type: "finish-step" },
      { type: "finish" },
    ] as unknown as TextStreamPart<ToolSet>[];
    const stream = new ReadableStream({ start: (controller) => { parts.forEach((part) => controller.enqueue(part)); controller.close(); } }).pipeThrough(
      pricingAnswerTransform<ToolSet>({ hold: () => true })({ tools: {} as ToolSet, stopStream: () => {} }),
    );
    let text = "";
    for await (const part of stream as unknown as AsyncIterable<TextStreamPart<ToolSet>>) if (part.type === "text-delta") text += part.text;
    expect(text).toContain("## Opciones de precio");
    expect(text).not.toContain("Te sale en $1.");
  });
});

describe("orden de las opciones de precio", () => {
  const line = (nombre: string, precio: number, acqPrice: number, stock: number): KitPriceLine => ({ productId: nombre, nombre, cantidad: 1, acqPrice, transportationCost: null, precioEfectivo: precio, precioDeLista: precio, stock, reservedUnits: 0 });
  const LINES = [line("Libreta", 5000, 2000, 5), line("Cartuchera", 16000, 8000, 3), line("Portaminas", 5500, 3000, 5), line("Rollo de stickers", 10000, 4200, 2), line("Llavero", 10000, 4800, 4)];
  const priced = (forRotation: boolean, discountPct = 25) => priceKitOptions({ lines: LINES, minMarginPct: 40, discountPct, forRotation });
  const result = (forRotation: boolean, discountPct = 25) => ({
    fuente: KIT_PRICE_TOOL,
    datos: {
      estado: "listo" as const,
      minimoPct: 40,
      descuentoPct: discountPct,
      paraRotar: forRotation,
      piezas: LINES.map((item) => ({ nombre: item.nombre, sku: `SKU-${item.nombre}`, cantidad: 1, costoUnitario: item.acqPrice, sinCosto: false, transporteNoRegistrado: true, precio: item.precioEfectivo, precioDeLista: item.precioDeLista, oferta: null, disponibles: item.stock, desactivada: false })),
      ...priced(forRotation, discountPct),
      kitExistente: null,
    },
  });

  it("recomendado (el más bajo que cumple), otros permitidos de mayor a menor, rotar, y los no permitidos al final", () => {
    const ordered = orderKitOptions(priced(true).opciones);
    expect(ordered.map(({ option, recommended }) => [option.precio, option.kinds.join("+"), option.permitido, recommended])).toEqual([
      [40900, "minimo", true, true],
      [45900, "separado", true, false],
      [26900, "rotar", null, false],
      [33900, "descuento", false, false],
    ]);
  });

  it("sin intención de rotar no aparece; sin costo no hay recomendado y van de mayor a menor", () => {
    expect(orderKitOptions(priced(false).opciones).map(({ option }) => option.kinds.join("+"))).toEqual(["minimo", "separado", "descuento"]);
    const noCost = priceKitOptions({ lines: [...LINES.slice(0, 4), { ...LINES[4], acqPrice: 0 }], minMarginPct: 40, discountPct: 12, forRotation: true }).opciones;
    expect(orderKitOptions(noCost).map(({ option, recommended }) => [option.kinds.join("+"), recommended])).toEqual([
      ["separado", false],
      ["descuento", false],
    ]);
  });

  it("la respuesta completa (snapshot)", () => {
    expect(composeKitPriceAnswer(result(true))).toMatchInlineSnapshot(`
      "## Resumen

      Kit de 5 piezas (5 unidades): por separado cuestan **$46.500**. Costo total $22.000. Alcanza para **2 kits** (limita Rollo de stickers).

      ## Opciones de precio

      1. **$40.900** · el más bajo que cumple tu mínimo de 40 % · margen 46,2 % · Si pagan con Bold: 40 % [[tag:Recomendado]]
      2. **$45.900** · lo mismo que por separado · margen 52,1 % · Si pagan con Bold: 46,2 %
      3. **$26.900** · Precio para rotar inventario (por debajo del 40 %, aprobado por Paula para mercancía quieta) · margen 18,2 % · Si pagan con Bold: 10,7 %
      4. **$33.900** · con 25 % de descuento · margen 35,1 % · Si pagan con Bold: 28,4 % [[tag:no permitido (menos del 40 %)]]

      ## Piezas

      - Libreta ×1 · costo $2.000 [[tag:transporte no registrado]] · precio $5.000 · 5 disponibles
      - Cartuchera ×1 · costo $8.000 [[tag:transporte no registrado]] · precio $16.000 · 3 disponibles
      - Portaminas ×1 · costo $3.000 [[tag:transporte no registrado]] · precio $5.500 · 5 disponibles
      - Rollo de stickers ×1 · costo $4.200 [[tag:transporte no registrado]] · precio $10.000 · 2 disponibles
      - Llavero ×1 · costo $4.800 [[tag:transporte no registrado]] · precio $10.000 · 4 disponibles

      ## Notas

      - Sin transporte registrado: Libreta, Cartuchera, Portaminas, Rollo de stickers, Llavero. El costo no incluye su envío, así que el margen real puede ser un poco menor.
      - No guardé ningún precio: si te sirve, créalo o cámbialo en Productos.

      :::detalle Cómo se calculó
      - Precio por separado: la suma de los precios de hoy de las piezas (con ofertas), bajada a un precio terminado en 900.
      - Margen como en la ficha de producto: (precio − costo) ÷ precio, con el costo de compra más el transporte registrado.
      - Tu mínimo de 40 % se exige en el peor caso: después de la comisión de Bold por pago en línea.
      - El precio para rotar usa el mismo piso que «Kits para rotar»: el costo más 20 %.
      :::"
    `);
  });
});
