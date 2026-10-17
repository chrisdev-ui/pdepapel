import { tool } from "ai";
import { z } from "zod";

import { KIT_NAME_MAX_WORDS } from "@/lib/copiloto/kits-rotation";

/**
 * Lo único que el modelo aporta a la respuesta de kits, como datos y no como
 * texto libre: por borrador, un nombre corto, dos frases de «Lo que amarás» y
 * para qué es ideal. Justo después de `kitsParaRotar` el chat le obliga a
 * llamar `textosDeKits` (`kitsTextsStep`) y se detiene ahí. El código valida
 * cada campo; uno que no sirva se reemplaza por el de la herramienta o por el
 * texto base, nunca por el de otro kit.
 */
export const KITS_TEXTS_TOOL = "textosDeKits";

// Sin límites en el esquema: el modo estricto de OpenAI no acepta todos; los aplica el código.
export const kitsTextsInput = z.object({
  kits: z.array(
    z.object({
      n: z.number().int().describe("El número del borrador (campo n de kitsParaRotar)"),
      nombreCorto: z.string().describe("Nombre corto del kit: máximo 6 palabras, sin precios ni el nombre completo de un producto, distinto del de los otros kits"),
      loQueAmaras: z
        .array(z.string())
        .describe(
          "Exactamente 2 frases cortas para la clienta que nombran las piezas reales de ese borrador (por su tipo o su nombre, como vienen en piezas) y para qué sirve cada una. Nada que no esté en sus piezas: ni otras piezas, ni funciones, personajes o marcas que sus nombres no digan. Sin precios, porcentajes ni promociones",
        ),
      idealPara: z.string().nullable().describe("Para qué o para quién es ideal, sin «Ideal para» al inicio («regalar en grados»); null si no aplica"),
    }),
  ),
});

export type KitsTextsInput = z.infer<typeof kitsTextsInput>;

export function textosDeKitsTool() {
  return tool({
    description:
      "Entrega, para cada borrador de kitsParaRotar, su nombre corto, las 2 frases de «Lo que amarás» y para qué es ideal. Es lo único que escribes en una respuesta de kits: el chat arma lo demás con los datos.",
    inputSchema: kitsTextsInput,
    execute: async (input) => ({ ok: true, recibidos: input.kits.length }),
  });
}

/** Después de un `kitsParaRotar` con borradores, el siguiente paso solo puede ser `textosDeKits`. */
export function kitsTextsStep(steps: readonly { toolResults?: readonly { toolName: string; output: unknown }[]; toolCalls?: readonly { toolName: string }[] }[]) {
  const last = steps[steps.length - 1];
  if (!last) return null;
  const kits = (last.toolResults ?? [])
    .filter((result) => result.toolName === "kitsParaRotar")
    .map((result) => (result.output as { datos?: { kits?: unknown[] } } | undefined)?.datos?.kits?.length ?? 0);
  if (!kits.length || kits[kits.length - 1] === 0) return null;
  if ((last.toolCalls ?? []).some((call) => call.toolName === KITS_TEXTS_TOOL)) return null;
  return { activeTools: [KITS_TEXTS_TOOL], toolChoice: { type: "tool" as const, toolName: KITS_TEXTS_TOOL } };
}

const BULLET_MAX = 130;
const IDEAL_MAX = 90;
const FORBIDDEN = /\$\s?\d|\d\s?%|\[\[|:::|https?:\/\/|<[a-z]/i;
const clean = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—•*·:"«“]+|[\s"»”.]+$/g, "")
    .trim();

export interface KitTexts {
  name: string | null;
  bullets: [string, string] | null;
  idealPara: string | null;
}

/** Lo que el modelo mandó, campo por campo: lo que no cumple queda en null. */
export function validateKitTexts(input: unknown): Map<number, KitTexts> {
  const parsed = kitsTextsInput.safeParse(input);
  const result = new Map<number, KitTexts>();
  if (!parsed.success) return result;
  for (const kit of parsed.data.kits) {
    if (result.has(kit.n)) continue;
    const raw = clean(kit.nombreCorto);
    const name = raw && !/^kit\b/i.test(raw) ? `Kit ${raw}` : raw.replace(/^kit\b/i, "Kit");
    const words = name.split(/\s+/).filter(Boolean).length;
    const bullets = kit.loQueAmaras.map(clean).filter(Boolean);
    const ideal = kit.idealPara === null ? "" : clean(kit.idealPara).replace(/^ideal para\s+/i, "");
    result.set(kit.n, {
      name: name && words <= KIT_NAME_MAX_WORDS && name.length <= 48 && !FORBIDDEN.test(name) && /[a-záéíóúñü]{2}/i.test(name) ? name : null,
      bullets: bullets.length === 2 && bullets.every((line) => line.length <= BULLET_MAX && !FORBIDDEN.test(line)) ? [bullets[0], bullets[1]] : null,
      idealPara: ideal && ideal.length <= IDEAL_MAX && !FORBIDDEN.test(ideal) ? ideal : null,
    });
  }
  return result;
}
