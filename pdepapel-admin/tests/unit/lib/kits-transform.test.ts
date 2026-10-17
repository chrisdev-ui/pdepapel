import { describe, expect, it, vi } from "vitest";

import { kitsAnswerTransform, kitsModelTextTap } from "@/lib/copiloto/skills/kits-transform";

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
      nombreSugerido: "Kit Libretas Kawaii",
      ocasion: null,
      n: 1,
      piezas: [{ nombre: "Libreta Prueba", rol: "lento", categoria: "Libretas", precioEfectivo: 9000 }],
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
const textsCall = (input: unknown) => ({ type: "tool-call", toolName: "textosDeKits", input });
const TEXTS = { kits: [{ n: 1, nombreCorto: "Kit escolar", loQueAmaras: ["La libreta para tus ideas en orden", "Sus hojas para tus apuntes de cada día"], idealPara: "el colegio" }] };

describe("respuesta de kits: la arma el código con los textos que el modelo manda como datos", () => {
  it("toma nombre y frases de textosDeKits, descarta el texto libre y sale una sola vez", async () => {
    const { text, types } = await run([
      toolResult(),
      { type: "text-start", id: "t" },
      { type: "text-delta", text: "Según kitsParaRotar… [[KIT-1]] nota suelta :::detalle x" },
      { type: "text-end", id: "t" },
      textsCall(TEXTS),
      { type: "finish" },
    ]);
    expect(types).toEqual(["tool-result", "tool-call", "text-start", "text-delta", "text-end", "finish"]);
    expect(text).toContain("### 🧺 Kit escolar");
    expect(text).toContain(":::copiar Texto para la ficha\n✨ Lo que amarás\n- La libreta para tus ideas en orden\n- Sus hojas para tus apuntes de cada día\n📦 Incluye\n- Libreta Prueba\n🎁 Ideal para el colegio.\n:::");
    expect(text).not.toMatch(/kitsParaRotar|nota suelta|\[\[KIT/);
  });

  it("sin la llamada a textosDeKits (o con datos que no sirven): texto base del kit", async () => {
    expect((await run([toolResult(), { type: "finish" }])).text).toContain(":::copiar Texto para la ficha (base)");
    expect((await run([toolResult(), textsCall({ kits: "no" }), { type: "finish" }])).text).toContain(":::copiar Texto para la ficha (base)");
  });

  it("sin la herramienta de kits, el texto pasa tal cual y textosDeKits no hace nada", async () => {
    expect((await run([{ type: "text-delta", text: "Hola" }, { type: "finish" }])).text).toBe("Hola");
    expect((await run([toolResult({}), { type: "text-delta", text: "Hola" }, { type: "finish" }])).text).toBe("Hola");
    expect((await run([textsCall(TEXTS), { type: "text-delta", text: "Hola" }, { type: "finish" }])).text).toBe("Hola");
  });

  it("si el flujo se corta sin «finish», la respuesta sale igual", async () => {
    const { text } = await run([toolResult(), textsCall(TEXTS)]);
    expect(text).toContain("### 🧺 Kit escolar");
  });

  it("si la herramienta corre dos veces (otro número de días), valen la última y sus textos", async () => {
    const second = { datos: { ...datos, criterios: { diasSinVenta: 120 } } };
    const { text } = await run([
      toolResult(),
      textsCall({ kits: [{ ...TEXTS.kits[0], nombreCorto: "Kit Primero" }] }),
      toolResult(second),
      textsCall({ kits: [{ ...TEXTS.kits[0], nombreCorto: "Kit Segundo" }] }),
      { type: "finish" },
    ]);
    expect(text).toContain("sin ventas en 120 días");
    expect(text).toContain("### 🧺 Kit Segundo");
    expect(text).not.toContain("Primero");
  });

  it("registra solo cuentas (kits, si llamó, con nombre, con texto, base), nunca el texto", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const seen: unknown[] = [];
    kitsModelTextTap.current = (sent) => seen.push(sent);
    try {
      await run([toolResult(), { type: "text-delta", text: "Una nota secreta" }, textsCall({ kits: [{ ...TEXTS.kits[0], loQueAmaras: ["Solo una"] }] }), { type: "finish" }]);
      const call = info.mock.calls.find(([label]) => label === "[COPILOTO] Kits armados");
      expect(call?.[1]).toEqual({ kits: 1, llamoTextos: true, conNombreDelModelo: 1, conTextoDelModelo: 0, base: 1 });
      expect(JSON.stringify(info.mock.calls)).not.toMatch(/secreta|Kit escolar/);
      expect(seen).toEqual([{ texts: { kits: [{ ...TEXTS.kits[0], loQueAmaras: ["Solo una"] }] }, text: "Una nota secreta" }]);
    } finally {
      kitsModelTextTap.current = null;
      info.mockRestore();
    }
  });
});
