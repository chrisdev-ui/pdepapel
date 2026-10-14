import { describe, expect, it } from "vitest";

import { kitsAnswerTransform, reconcileKitAnswer, type KitOutput } from "@/lib/copiloto/skills/kits-transform";

type Part = Record<string, unknown> & { type: string };

async function run(parts: Part[]): Promise<string> {
  const stream = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(kitsAnswerTransform()({ tools: {}, stopStream: () => undefined } as never) as unknown as TransformStream<Part, Part>);
  let text = "";
  for await (const part of stream as unknown as AsyncIterable<Part>) if (part.type === "text-delta") text += part.text as string;
  return text;
}

const toolResult = (linea: string | null) => ({ type: "tool-result", toolName: "kitsParaRotar", output: { datos: { nuevosSinDatosDeVenta: { linea } } } });

describe("línea de productos nuevos en la respuesta de kits", () => {
  it("si el modelo no la escribió, se agrega al final, una sola vez", async () => {
    const text = await run([toolResult("Nuevos sin datos de venta: 108 (no se tratan como lentos)."), { type: "text-delta", text: "Hay 451 productos lentos." }, { type: "finish" }]);
    expect(text).toBe("Hay 451 productos lentos.\n\nNuevos sin datos de venta: 108 (no se tratan como lentos).");
  });

  it("si ya la trae (aunque sea con otra puntuación), no se repite", async () => {
    const text = await run([toolResult("Nuevos sin datos de venta: 3 (no se tratan como lentos)."), { type: "text-delta", text: "Lentos…\n\nNuevos sin datos de venta: 3 — no son lentos." }, { type: "finish" }]);
    expect(text.match(/Nuevos sin datos de venta/g)).toHaveLength(1);
  });

  it("sin productos nuevos, o sin la herramienta, no agrega nada", async () => {
    expect(await run([toolResult(null), { type: "text-delta", text: "Hola" }, { type: "finish" }])).toBe("Hola");
    expect(await run([{ type: "text-delta", text: "Hola" }, { type: "finish" }])).toBe("Hola");
  });
});

const kitOf = (name: string, pieces: [string, number][], ahorro: number, sugerido: number): KitOutput => ({
  nombreSugerido: name,
  piezas: pieces.map(([nombre, precioEfectivo]) => ({ nombre, precioEfectivo })),
  ahorroParaLaClienta: ahorro,
  detalle: [
    ...pieces.map(([nombre, precio]) => `- ${nombre}: $${precio.toLocaleString("es-CO")}`),
    `precio sugerido $${sugerido.toLocaleString("es-CO")} · ahorro $${ahorro.toLocaleString("es-CO")} (12 %).`,
  ].join("\n"),
});
const grados = kitOf("Kit de grados con Libreta", [["Libreta lenta", 6000], ["Lápiz HB", 4000], ["Regla", 2500]], 1600, 10900);
const oficina = kitOf("Kit de oficina con Agenda", [["Agenda roja", 9000], ["Lápiz HB", 4000], ["Clips", 2500]], 1900, 13600);
const priced = (text: string) => Array.from(text.matchAll(/\$\s?[\d.]+/g), (match) => match[0]);
const kitsResult = (kits: KitOutput[], linea: string | null = null) => ({ type: "tool-result", toolName: "kitsParaRotar", output: { datos: { nuevosSinDatosDeVenta: { linea }, kits } } });

describe("cada kit con los números de la herramienta", () => {
  it("(a) un kit que el modelo ya listó completo, reconocido por sus piezas, no se repite", () => {
    const answer = "Kit de grados:\n- Libreta lenta: $6.000\n- Lápiz HB: $4.000\n- Regla: $2.500\nPrecio $10.900, ahorro $1.600 (12 %).";
    expect(reconcileKitAnswer(answer, [grados])).toBe(answer);
  });

  it("(a) otro kit que comparte precios con el listado no cuenta como listado: se agrega el suyo", () => {
    const answer = "Kit de grados:\n- Libreta lenta: $6.000\n- Lápiz HB: $4.000\n- Regla: $2.500\nPrecio $10.900, ahorro $1.600 (12 %).";
    const out = reconcileKitAnswer(answer, [grados, oficina]);
    expect(out.startsWith(answer)).toBe(true);
    expect(out.match(/Detalle de/g)).toHaveLength(1);
    expect(out).toContain("**Detalle de «Kit de oficina con Agenda»**\n- Agenda roja: $9.000");
  });

  it("(a) un kit resumido sin precios por pieza recibe su detalle debajo, una sola vez", () => {
    const answer = "Lentos: Libreta lenta, 8 disponibles, $24.000 quietos.\n\nKit de grados con Libreta lenta, Lápiz HB y Regla: ahorro $1.600 (12 %).\n\nSon borradores.";
    const out = reconcileKitAnswer(answer, [grados]);
    expect(out.split("\n\n")[2]).toBe(`**Detalle de «Kit de grados con Libreta»**\n${grados.detalle}`);
    expect(out.match(/Detalle de/g)).toHaveLength(1);
    expect(out).toContain("$24.000 quietos");
  });

  it("(b) si el modelo da otro precio, gana el de la herramienta y no quedan dos precios para el mismo kit", () => {
    const answer = "Kit de grados con Libreta lenta, Lápiz HB y Regla.\nPrecio sugerido $9.900 y ahorro $2.600.\nSe pueden armar 8.\n\n📦 Incluye: Libreta lenta, Lápiz HB, Regla.";
    const out = reconcileKitAnswer(answer, [grados]);
    expect(out).not.toContain("$9.900");
    expect(out).not.toContain("$2.600");
    expect(out).toContain("precio sugerido $10.900 · ahorro $1.600 (12 %)");
    expect(priced(out).filter((amount) => amount === "$10.900")).toHaveLength(1);
    expect(out).toContain("Se pueden armar 8.");
    expect(out).toContain("📦 Incluye: Libreta lenta, Lápiz HB, Regla.");
  });

  it("(b) por la ruta del chat: el texto del modelo se corrige antes de salir", async () => {
    const text = await run([
      kitsResult([grados], "Nuevos sin datos de venta: 1 (no se tratan como lentos)."),
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", text: "Kit de grados con Libreta lenta, Lápiz HB y Regla.\n" },
      { type: "text-delta", id: "t1", text: "- Lápiz HB: $3.500\nPrecio $10.900, ahorro $1.600." },
      { type: "text-end", id: "t1" },
      { type: "finish" },
    ]);
    expect(text).not.toContain("$3.500");
    expect(text).toContain("- Lápiz HB: $4.000");
    expect(text.trim().endsWith("Nuevos sin datos de venta: 1 (no se tratan como lentos).")).toBe(true);
  });

  it("si el flujo se corta sin «finish», lo guardado sale igual", async () => {
    const text = await run([kitsResult([grados]), { type: "text-delta", id: "t1", text: "Kit con Libreta lenta y Lápiz HB." }]);
    expect(text).toContain("Kit con Libreta lenta y Lápiz HB.");
    expect(text).toContain("Detalle de «Kit de grados con Libreta»");
  });
});
