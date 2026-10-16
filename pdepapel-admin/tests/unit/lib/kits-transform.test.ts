import { describe, expect, it, vi } from "vitest";

import { kitMarker, kitsAnswerTransform, kitsModelTextTap } from "@/lib/copiloto/skills/kits-transform";

type Part = Record<string, unknown> & { type: string };

async function run(parts: Part[]): Promise<{ text: string; types: string[] }> {
  const stream = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(kitsAnswerTransform()({ tools: {}, stopStream: () => undefined } as never) as unknown as TransformStream<Part, Part>);
  let text = "";
  const types: string[] = [];
  for await (const part of stream as unknown as AsyncIterable<Part>) {
    types.push(part.type);
    if (part.type === "text-delta") text += part.text as string;
  }
  return { text, types };
}

const datos = {
  criterios: { diasSinVenta: 90 },
  totalLentos: 1,
  plataQuietaACostoTotal: 24000,
  lentosSinCosto: 0,
  lentos: [{ nombre: "Libreta Prueba", disponible: 8, plataQuietaACosto: 24000, ultimaVenta: "hace 120 días" }],
  nuevosSinDatosDeVenta: { cantidad: 0 },
  quietosDeBajoValor: { cantidad: 0 },
  kits: [
    {
      nombreSugerido: "Kit escolar Prueba",
      ocasion: null,
      marcador: kitMarker(0),
      piezas: [{ nombre: "Libreta Prueba", rol: "lento", precioEfectivo: 9000 }],
      kitsArmables: 2,
      sumaPreciosEfectivos: 12000,
      precioSugerido: 10900,
      ahorroPct: 9.2,
      margenPct: 55,
      margenBajo: false,
      señales: ["Libreta Prueba: 120 días sin venderse"],
    },
  ],
};
const toolResult = (output: unknown = { datos }) => ({ type: "tool-result", toolName: "kitsParaRotar", output });

describe("respuesta de kits: la arma el código al terminar", () => {
  it("lo que escribe el modelo se guarda y sale una sola vez, armado con la herramienta", async () => {
    const { text, types } = await run([
      toolResult(),
      { type: "text-start", id: "t" },
      { type: "text-delta", text: "Según kitsParaRotar… " },
      { type: "text-delta", text: "[[KIT-1]] Kit escolar\n✨ Lo que amarás\n- Algo" },
      { type: "text-end", id: "t" },
      { type: "finish" },
    ]);
    expect(types).toEqual(["tool-result", "text-start", "text-delta", "text-end", "finish"]);
    expect(text).toContain("## Resumen");
    expect(text).toContain("### ✏️ Kit escolar");
    expect(text).toContain(":::copiar Texto para la ficha\n✨ Lo que amarás\n- Algo\n:::");
    expect(text).not.toContain("kitsParaRotar");
  });

  it("sin la herramienta de kits, el texto pasa tal cual", async () => {
    expect((await run([{ type: "text-delta", text: "Hola" }, { type: "finish" }])).text).toBe("Hola");
    expect((await run([toolResult({}), { type: "text-delta", text: "Hola" }, { type: "finish" }])).text).toBe("Hola");
  });

  it("si el flujo se corta sin «finish», la respuesta sale igual", async () => {
    const { text } = await run([toolResult(), { type: "text-delta", text: "[[KIT-1]] Kit escolar" }]);
    expect(text).toContain("### ✏️ Kit escolar");
  });

  it("si la herramienta corre dos veces (otro número de días), vale la última y su texto", async () => {
    const second = { datos: { ...datos, criterios: { diasSinVenta: 120 } } };
    const { text } = await run([toolResult(), { type: "text-delta", text: "[[KIT-1]] Primero" }, toolResult(second), { type: "text-delta", text: "[[KIT-1]] Segundo" }, { type: "finish" }]);
    expect(text).toContain("sin ventas en 120 días");
    expect(text).toContain("### ✏️ Segundo");
    expect(text).not.toContain("Primero");
  });

  it("registra solo la forma de lo que entregó el modelo (cuántos kits con marcador, nombre y texto), nunca el texto", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const seen: string[] = [];
    kitsModelTextTap.current = (text) => seen.push(text);
    try {
      await run([toolResult(), { type: "text-delta", text: "[[KIT-1]] Kit escolar\nUna nota secreta" }, { type: "finish" }]);
      const call = info.mock.calls.find(([label]) => label === "[COPILOTO] Kits armados");
      expect(call?.[1]).toEqual({ kits: 1, conMarcador: 1, conNombre: 1, conTexto: 0, caracteres: 38 });
      expect(JSON.stringify(info.mock.calls)).not.toContain("secreta");
      expect(seen).toEqual(["[[KIT-1]] Kit escolar\nUna nota secreta"]);
    } finally {
      kitsModelTextTap.current = null;
      info.mockRestore();
    }
  });
});
