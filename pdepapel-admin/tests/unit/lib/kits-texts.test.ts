import { describe, expect, it } from "vitest";

import { KITS_TEXTS_TOOL, kitsTextsStep, textosDeKitsTool, validateKitTexts } from "@/lib/copiloto/skills/kits-texts";

const kitsResult = (count: number) => ({ toolName: "kitsParaRotar", output: { datos: { kits: Array.from({ length: count }, () => ({})) } } });

describe("textos de los kits como datos", () => {
  it("después de borradores de kits, el siguiente paso solo puede llamar textosDeKits", () => {
    expect(kitsTextsStep([{ toolResults: [kitsResult(2)] }])).toEqual({ activeTools: [KITS_TEXTS_TOOL], toolChoice: { type: "tool", toolName: KITS_TEXTS_TOOL } });
  });

  it("sin borradores, con otra herramienta, sin pasos o ya llamada: no obliga nada", () => {
    expect(kitsTextsStep([])).toBeNull();
    expect(kitsTextsStep([{ toolResults: [kitsResult(0)] }])).toBeNull();
    expect(kitsTextsStep([{ toolResults: [{ toolName: "buscarProductos", output: {} }] }])).toBeNull();
    expect(kitsTextsStep([{ toolResults: [kitsResult(2)], toolCalls: [{ toolName: KITS_TEXTS_TOOL }] }])).toBeNull();
    // Solo mira el último paso: en uno posterior ya no obliga.
    expect(kitsTextsStep([{ toolResults: [kitsResult(2)] }, { toolResults: [{ toolName: KITS_TEXTS_TOOL, output: { ok: true } }] }])).toBeNull();
  });

  it("la herramienta solo acusa recibo: no escribe nada", async () => {
    const result = await (textosDeKitsTool().execute as (input: unknown, options: unknown) => Promise<unknown>)({ kits: [{ n: 1, nombreCorto: "Kit", loQueAmaras: ["a", "b"], idealPara: null }] }, {});
    expect(result).toEqual({ ok: true, recibidos: 1 });
  });

  it("valida cada campo por separado y limpia lo que sobra", () => {
    const texts = validateKitTexts({
      kits: [
        { n: 1, nombreCorto: "  «Kit Colores Primavera».  ", loQueAmaras: ["- Colores que alegran tus tareas", "• Todo en un solo estuche"], idealPara: "Ideal para el colegio." },
        { n: 2, nombreCorto: "Kit de colores pastel con estuche y libreta", loQueAmaras: ["Uno", "Dos", "Tres"], idealPara: "regalar :::detalle" },
        { n: 3, nombreCorto: "Kit $9.900", loQueAmaras: ["Ahorra 20 %", "Dos"], idealPara: null },
        { n: 1, nombreCorto: "Kit repetido", loQueAmaras: ["a", "b"], idealPara: null },
      ],
    });
    expect(texts.get(1)).toEqual({ name: "Kit Colores Primavera", bullets: ["Colores que alegran tus tareas", "Todo en un solo estuche"], idealPara: "el colegio" });
    expect(texts.get(2)).toEqual({ name: null, bullets: null, idealPara: null });
    expect(texts.get(3)).toEqual({ name: null, bullets: null, idealPara: null });
    expect(texts.size).toBe(3);
  });

  it("todo nombre empieza por «Kit», sin pasarse de 6 palabras", () => {
    const names = validateKitTexts({
      kits: [
        { n: 1, nombreCorto: "Carpetas Kawaii", loQueAmaras: ["a", "b"], idealPara: null },
        { n: 2, nombreCorto: "kit libretas", loQueAmaras: ["a", "b"], idealPara: null },
        { n: 3, nombreCorto: "Colores de clase para el colegio", loQueAmaras: ["a", "b"], idealPara: null },
      ],
    });
    expect([1, 2, 3].map((n) => names.get(n)?.name)).toEqual(["Kit Carpetas Kawaii", "Kit libretas", null]);
  });

  it("frases demasiado largas, enlaces o HTML no pasan; datos con otra forma no dejan nada", () => {
    const long = "x".repeat(111);
    expect(validateKitTexts({ kits: [{ n: 1, nombreCorto: "Kit A", loQueAmaras: [long, "b"], idealPara: "https://tienda.co" }] }).get(1)).toEqual({ name: "Kit A", bullets: null, idealPara: null });
    expect(validateKitTexts({ kits: [{ n: 1, nombreCorto: "Kit A", loQueAmaras: ["<b>a</b>", "b"], idealPara: null }] }).get(1)?.bullets).toBeNull();
    expect(validateKitTexts(null).size).toBe(0);
    expect(validateKitTexts({ kits: "no" }).size).toBe(0);
  });
});
