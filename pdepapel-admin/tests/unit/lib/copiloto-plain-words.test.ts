import { describe, expect, it } from "vitest";

import { INTERNAL_WORDS, plainWordsTransform, toPlainWords } from "@/lib/copiloto/plain-words";
import { SKILL_TOOL_NAMES } from "@/lib/copiloto/skills";

type Part = Record<string, unknown> & { type: string };

async function run(parts: Part[]): Promise<string> {
  const stream = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(plainWordsTransform()({ tools: {}, stopStream: () => undefined } as never) as unknown as TransformStream<Part, Part>);
  let text = "";
  for await (const part of stream as unknown as AsyncIterable<Part>) if (part.type === "text-delta") text += part.text as string;
  return text;
}

describe("palabras simples en las respuestas", () => {
  it("nombres de herramientas y términos internos cambian por palabras de Paula", () => {
    expect(toPlainWords("Según kitsParaRotar, la suma de precios efectivos es $25.500 y el precio efectivo del lápiz $4.000. Libreta (lento).")).toBe(
      "Según el inventario, el precio por separado es $25.500 y el precio actual del lápiz $4.000. Libreta (quieto).",
    );
    expect(toPlainWords("Lo saqué de resumenDeHoy y de porReponer; plataQuietaACostoTotal $50.000")).toBe("Lo saqué del resumen de hoy y de lo que hay que reponer; plata quieta a costo $50.000");
  });

  it("«de el» y «a el» se contraen solo con lo que cambió aquí", () => {
    expect(toPlainWords("Vino de kitsParaRotar y fui a saludMercadoLibre.")).toBe("Vino del inventario y fui al estado de Mercado Libre.");
    expect(toPlainWords("Es de el Tiempo")).toBe("Es de el Tiempo");
  });

  it("no toca citas, nombres de productos ni palabras parecidas", () => {
    const text = "Ver [conocimiento: marcadores-acrilicos]. Caja de herramientas y Marcador porReponerX.";
    expect(toPlainWords(text)).toBe(text);
  });

  it("cubre todas las herramientas del copiloto", async () => {
    const { COPILOT_TOOL_NAMES } = await import("@/lib/copiloto/tools");
    for (const name of [...COPILOT_TOOL_NAMES, ...SKILL_TOOL_NAMES, "cargarHabilidad"]) {
      expect(INTERNAL_WORDS, name).toContain(name);
      expect(toPlainWords(`usé ${name}.`), name).not.toContain(name);
    }
  });

  it("en el flujo: un nombre partido entre dos pedazos también cambia, y no se pierde texto", async () => {
    const text = await run([
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", text: "Hola Paula. Según kitsPara" },
      { type: "text-delta", id: "t", text: "Rotar hay 3 quietos y la suma de precios " },
      { type: "text-delta", id: "t", text: "efectivos es $25.500. Fin." },
      { type: "text-end", id: "t" },
      { type: "finish" },
    ]);
    expect(text).toBe("Hola Paula. Según el inventario hay 3 quietos y el precio por separado es $25.500. Fin.");
  });

  it("si el flujo se corta sin «text-end» ni «finish», lo guardado sale igual", async () => {
    expect(await run([{ type: "text-delta", id: "t", text: "corto con resumenDeHoy" }])).toBe("corto con el resumen de hoy");
  });
});
