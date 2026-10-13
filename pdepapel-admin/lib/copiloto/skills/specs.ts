import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

import { extractDescriptionBlock } from "@/lib/copiloto/description-html";
import { DESCRIPTION_MARKERS } from "@/lib/copiloto/skills/descripciones";
import { foldText } from "@/lib/copiloto/skills/product-match";

/**
 * Especificaciones confirmadas de un producto, como pares clave y valor: las
 * líneas «Clave: valor» de la descripción que escribió Paula y los campos de
 * la ficha. El copiloto tiene que llevarlas todas a «📌 Especificaciones
 * Técnicas», y la ruta del chat revisa que estén (sin otra llamada al modelo).
 */
export interface Spec {
  clave: string;
  valor: string;
  fuente: "ficha" | "descripcion";
}

export interface SpecConflict {
  clave: string;
  ficha: string;
  descripcion?: string;
  motivo: string;
}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };
const LEADING = new RegExp("^(?:[-•*·]|\\p{Extended_Pictographic}|\\uFE0F|\\u200D|\\s)+", "u");

function toLines(text: string): string[] {
  return text
    .replace(/<li[^>]*>/gi, "\n")
    .replace(/<\/(?:p|h[1-6]|li|blockquote)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|nbsp|quot|#39|lt|gt);/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? " ")
    .split("\n")
    .map((line) => line.replace(/\*\*/g, "").replace(LEADING, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export const normalizeSpecKey = (key: string) => foldText(key).replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
/** «0.7 mm» y «0,7 mm» son lo mismo; sin tildes, mayúsculas ni el punto final. */
export const normalizeSpecValue = (value: string) =>
  foldText(value)
    .replace(/(\d)\.(\d)/g, "$1,$2")
    .replace(/\s+/g, " ")
    .replace(/[.;\s]+$/, "")
    .trim();

const SPEC_HEADING = /^(especificaciones|ficha tecnica|caracteristicas)\b/;
const SPEC_VALUE_MAX = 80;

function pairOf(line: string): { clave: string; valor: string } | null {
  const match = /^([^:]{2,40}):\s*(\S.*)$/.exec(line);
  if (!match) return null;
  const clave = match[1].trim();
  const valor = match[2].replace(/[.;\s]+$/, "").trim();
  if (!valor || /^\d+$/.test(clave) || /https?/i.test(clave) || clave.split(" ").length > 6) return null;
  return { clave, valor };
}

/**
 * «Clave: valor» de la descripción (HTML o texto). Si hay una sección de
 * especificaciones («Especificaciones…», «Ficha técnica», «Características»),
 * solo cuenta lo que está en ella; las viñetas de beneficios («Escritura
 * ultra fluida (0.7 mm): Punta fina…») no son especificaciones. Sin esa
 * sección, solo los pares cortos.
 */
export function extractDescriptionSpecs(description: string | null | undefined): { clave: string; valor: string }[] {
  const lines = toLines(description ?? "");
  const section: { clave: string; valor: string }[] = [];
  let inSection = false;
  let sawSection = false;
  for (const line of lines) {
    const folded = foldText(line).replace(/[^a-z0-9ñ ]+/g, " ").trim();
    const pair = pairOf(line);
    if (SPEC_HEADING.test(folded) && (!pair || pair.valor.length === 0)) {
      inSection = true;
      sawSection = true;
      continue;
    }
    if (!inSection) continue;
    if (pair) section.push(pair);
    else inSection = false;
  }
  if (sawSection) return section;
  return lines.map(pairOf).filter((pair): pair is { clave: string; valor: string } => Boolean(pair && pair.valor.length <= SPEC_VALUE_MAX));
}

/** Diseños del panel que no le dicen nada a una clienta. */
export const GENERIC_DESIGNS = /^(cl[aá]sico|original|b[aá]sico|liso|sin dise[nñ]o|est[aá]ndar|elegante|normal|gen[eé]rico|ninguno)$/i;
const MANY_COLORS = /\b\d+\s*(?:colores|tonos)\b|\bmulticolor\w*|\bsurtid\w*|\bvarios colores\b/;
const SET_OF_N = /\bset\s+(?:de\s+|x\s?)?\d+\b|\bx\s?\d+\b(?!\s?(?:x|mm|cm|ml|m|g|gr|kg)\b)/;

// Colores de cuerpo, por raíz. «Pastel», «neón» o «metalizado» no son un color.
const COLOR_WORD =
  /\b(rosad?[oa]?s?|azul(?:es)?|verdes?|amarill[oa]s?|negr[oa]s?|blanc[oa]s?|roj[oa]s?|morad[oa]s?|lilas?|naranjas?|gris(?:es)?|cafe|marron(?:es)?|dorad[oa]s?|platead[oa]s?|beige|fucsias?|turquesas?|celestes?|violetas?)\b/g;
// «Tinta negra» habla de la tinta, no del color del producto.
const INK_COLOR = /\btinta\s*:?\s*(?:de\s+)?(?:color\s+)?[a-z]+/g;
const SIZE_WORD = /\b(a[3-6]|carta|oficio|tabloide|mini|jumbo|grandes?|median[oa]s?|peque(?:n|ñ)[oa]s?)\b/g;

function colorRoot(word: string): string {
  if (word.startsWith("rosa") || word.startsWith("rosad")) return "rosa";
  for (const root of ["azul", "verde", "amarill", "negr", "blanc", "roj", "morad", "lila", "naranja", "gris", "cafe", "marron", "dorad", "platead", "beige", "fucsia", "turquesa", "celeste", "violeta"]) {
    if (word.startsWith(root)) return root;
  }
  return word;
}

function sizeRoot(word: string): string {
  if (/^peque/.test(word)) return "pequeno";
  if (/^median/.test(word)) return "mediano";
  if (/^grande/.test(word)) return "grande";
  return word;
}

const rootsIn = (text: string, pattern: RegExp, root: (word: string) => string) => new Set(Array.from(text.matchAll(pattern), (match) => root(match[1])));

/** El valor de la ficha no aparece y el texto nombra otro: no se puede afirmar. */
function namesAnother(value: string, text: string, pattern: RegExp, root: (word: string) => string): string[] | null {
  const own = rootsIn(value, pattern, root);
  if (own.size !== 1) return null;
  const said = rootsIn(text, pattern, root);
  const [mine] = Array.from(own);
  if (!said.size || said.has(mine)) return null;
  return Array.from(text.matchAll(pattern), (match) => match[1]).filter((word, index, all) => all.indexOf(word) === index);
}

/**
 * Un campo de la ficha que no se puede afirmar tal cual: un solo color cuando
 * el nombre o la descripción hablan de varios o nombran otro, una talla que
 * contradice la del texto, o un diseño genérico del panel.
 */
export function fieldDoubt(clave: string, valor: string, context: string): string | null {
  const key = normalizeSpecKey(clave);
  const value = foldText(valor);
  const text = foldText(context);
  if (key === "color" && !MANY_COLORS.test(value)) {
    if (MANY_COLORS.test(text)) return `la ficha dice un solo color (${valor}), pero el nombre o la descripción hablan de varios colores`;
    if (SET_OF_N.test(text) && !text.includes(value)) return `la ficha dice un solo color (${valor}) para un set de varias unidades`;
    const other = namesAnother(value, text.replace(INK_COLOR, "tinta"), COLOR_WORD, colorRoot);
    if (other) return `la ficha dice ${valor}, pero el nombre o la descripción dicen ${other.join(", ")}`;
  }
  if (key === "tamano") {
    const other = namesAnother(value, text, SIZE_WORD, sizeRoot);
    if (other) return `la ficha dice ${valor}, pero el nombre o la descripción dicen ${other.join(", ")}`;
  }
  if ((key === "diseno" || key === "diseño") && GENERIC_DESIGNS.test(valor.trim())) {
    return `«${valor}» es un valor genérico del panel, no describe el diseño`;
  }
  return null;
}

/**
 * Ficha primero; la descripción suma lo que no está. Queda «por confirmar» lo
 * que la descripción contradice y el campo de la ficha que fieldDoubt rechaza.
 */
export function buildSpecs(input: {
  name?: string | null;
  description: string | null | undefined;
  fields: { clave: string; valor: string | null | undefined }[];
}) {
  const specs: Spec[] = [];
  const conflicts: SpecConflict[] = [];
  const byKey = new Map<string, Spec>();
  const context = `${input.name ?? ""}\n${toLines(input.description ?? "").join("\n")}`;
  for (const field of input.fields) {
    const valor = field.valor?.trim();
    if (!valor || byKey.has(normalizeSpecKey(field.clave))) continue;
    const doubt = fieldDoubt(field.clave, valor, context);
    if (doubt) {
      conflicts.push({ clave: field.clave, ficha: valor, motivo: doubt });
      continue;
    }
    const spec: Spec = { clave: field.clave, valor, fuente: "ficha" };
    byKey.set(normalizeSpecKey(field.clave), spec);
    specs.push(spec);
  }
  for (const pair of extractDescriptionSpecs(input.description)) {
    const key = normalizeSpecKey(pair.clave);
    const existing = byKey.get(key);
    if (!existing) {
      const spec: Spec = { ...pair, fuente: "descripcion" };
      byKey.set(key, spec);
      specs.push(spec);
      continue;
    }
    const a = normalizeSpecValue(existing.valor);
    const b = normalizeSpecValue(pair.valor);
    if (existing.fuente === "ficha" && !a.includes(b) && !b.includes(a)) {
      conflicts.push({ clave: existing.clave, ficha: existing.valor, descripcion: pair.valor, motivo: "la ficha y la descripción dicen cosas distintas" });
    }
  }
  return { specs, conflicts };
}

const valueTokens = (value: string) => normalizeSpecValue(value).split(/[^a-z0-9ñ,]+/).filter((token) => token.length >= 2 || /\d/.test(token));

/** Las especificaciones cuyo valor no aparece en el texto (todas sus palabras, sin importar el orden). */
export function missingSpecs(specs: { clave: string; valor: string }[], text: string): { clave: string; valor: string }[] {
  const haystack = normalizeSpecValue(text);
  return specs.filter((spec) => !valueTokens(spec.valor).every((token) => haystack.includes(token.replace(/,$/, ""))));
}

export const specWarning = (missing: { clave: string; valor: string }[]) =>
  `⚠️ Faltó en especificaciones: ${missing.map((spec) => `${spec.clave}: ${spec.valor}`).join("; ")}`;

/**
 * Revisa la respuesta al terminar: si escribió una descripción y le faltan
 * especificaciones que trajo productoParaDescripcion, agrega una línea para
 * que Paula lo vea. No llama al modelo.
 */
export function specCheckTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    let text = "";
    let specs: { clave: string; valor: string }[] = [];
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "text-delta") text += part.text;
        if (part.type === "tool-result" && part.toolName === "productoParaDescripcion") {
          const found = (part.output as { datos?: { especificaciones?: { clave: string; valor: string }[] } } | undefined)?.datos?.especificaciones;
          if (Array.isArray(found)) specs = found;
        }
        if (part.type === "finish" && specs.length && text.includes(DESCRIPTION_MARKERS.description)) {
          const missing = missingSpecs(specs, extractDescriptionBlock(text) ?? text);
          if (missing.length) {
            const id = "spec-check";
            controller.enqueue({ type: "text-start", id } as TextStreamPart<TOOLS>);
            controller.enqueue({ type: "text-delta", id, text: `\n\n${specWarning(missing)}` } as TextStreamPart<TOOLS>);
            controller.enqueue({ type: "text-end", id } as TextStreamPart<TOOLS>);
          }
        }
        controller.enqueue(part);
      },
    });
  };
}
