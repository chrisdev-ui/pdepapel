/**
 * El formato de las respuestas del copiloto: un markdown chico que el chat
 * sabe pintar en el teléfono, y las piezas para armarlo desde el código.
 *
 *   ## Sección            ### Subsección
 *   1. numerada           - viñeta (cada nivel, 2 espacios más)
 *   **negrita**           [[tag:quieto]]  (etiqueta chica)
 *   :::detalle Título     … plegado por defecto …   :::
 *   :::copiar Título      … texto para la clienta, con «Copiar» …   :::
 *
 * Sin tablas ni HTML. El parser es tolerante: una línea con sangría y sin
 * viñeta sigue a la viñeta de arriba, un bloque sin cerrar (la respuesta
 * todavía llegando) se pinta abierto hasta el final, y una respuesta vieja
 * (solo viñetas y negrita) se lee igual. Puro: sirve en el servidor y en el chat.
 */

export type Inline = string;

export interface ListItem {
  text: Inline;
  children: ListBlock | null;
}

export interface ListBlock {
  type: "list";
  ordered: boolean;
  items: ListItem[];
}

export type AnswerBlock =
  | { type: "heading"; level: 2 | 3; text: Inline }
  | { type: "paragraph"; text: Inline }
  | ListBlock
  | { type: "details"; title: string; blocks: AnswerBlock[]; closed: boolean }
  | { type: "copy"; title: string; text: string; blocks: AnswerBlock[]; closed: boolean }
  | { type: "spacer" };

const FENCE_OPEN = /^:::(detalle|copiar)(?:\s+(.*))?$/;
const FENCE_CLOSE = /^:::\s*$/;
const HEADING = /^(#{2,3})\s+(.+)$/;
const BULLET = /^( *)[-*•] (.*)$/;
const NUMBERED = /^( *)(\d+)[.)] (.*)$/;

/** Marcadores internos y restos de «:::» que no abren ni cierran un bloque: nunca se pintan. */
export function stripInternalMarks(line: string): string {
  const withoutMarkers = line.replace(/\[\[\s*KIT[^\]]*\]\]/gi, "");
  if (/^\s*:::/.test(withoutMarkers)) return "";
  const fence = withoutMarkers.indexOf(":::");
  return (fence >= 0 ? withoutMarkers.slice(0, fence) : withoutMarkers).trimEnd();
}

interface LineItem {
  depth: number;
  ordered: boolean;
  text: string;
}

function buildList(lines: LineItem[]): ListBlock {
  const root: ListBlock = { type: "list", ordered: lines[0].ordered, items: [] };
  const stack: { depth: number; list: ListBlock }[] = [{ depth: lines[0].depth, list: root }];
  for (const line of lines) {
    while (stack.length > 1 && line.depth < stack[stack.length - 1].depth) stack.pop();
    let top = stack[stack.length - 1];
    if (line.depth > top.depth && top.list.items.length > 0) {
      const parent = top.list.items[top.list.items.length - 1];
      parent.children ??= { type: "list", ordered: line.ordered, items: [] };
      stack.push({ depth: line.depth, list: parent.children });
      top = stack[stack.length - 1];
    }
    top.list.items.push({ text: line.text, children: null });
  }
  return root;
}

/** Las líneas de un texto, en bloques. `closed` dice si el bloque plegable ya terminó. */
export function parseAnswer(text: string): AnswerBlock[] {
  return parseLines(text.replace(/\r\n/g, "\n").split("\n"), 0).blocks;
}

function parseLines(lines: string[], start: number, untilFence = false): { blocks: AnswerBlock[]; next: number; closed: boolean } {
  const blocks: AnswerBlock[] = [];
  let list: LineItem[] = [];
  const flushList = () => {
    if (list.length) blocks.push(buildList(list));
    list = [];
  };
  let index = start;
  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trimEnd();
    if (untilFence && FENCE_CLOSE.test(line.trim())) {
      flushList();
      return { blocks, next: index + 1, closed: true };
    }
    const fence = FENCE_OPEN.exec(line.trim());
    if (fence) {
      flushList();
      const inner = parseLines(lines, index + 1, true);
      const title = (fence[2] ?? "").trim() || (fence[1] === "copiar" ? "Texto para copiar" : "Detalle");
      if (fence[1] === "detalle") blocks.push({ type: "details", title, blocks: inner.blocks, closed: inner.closed });
      else {
        const end = inner.closed ? inner.next - 1 : lines.length;
        const text = lines
          .slice(index + 1, end)
          .map(stripInternalMarks)
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        blocks.push({ type: "copy", title, text, blocks: inner.blocks, closed: inner.closed });
      }
      index = inner.next;
      continue;
    }
    const clean = stripInternalMarks(line);
    if (line.trim() && !clean.trim()) {
      index += 1;
      continue;
    }
    const heading = HEADING.exec(clean);
    if (heading) {
      flushList();
      blocks.push({ type: "heading", level: heading[1].length === 2 ? 2 : 3, text: heading[2].trim() });
      index += 1;
      continue;
    }
    const bullet = BULLET.exec(clean) ?? null;
    const numbered = bullet ? null : NUMBERED.exec(clean);
    if (bullet || numbered) {
      const indent = (bullet ?? numbered)![1].length;
      list.push({ depth: Math.floor(indent / 2), ordered: Boolean(numbered), text: (bullet ? bullet[2] : numbered![3]).trim() });
      index += 1;
      continue;
    }
    if (!clean.trim()) {
      flushList();
      if (blocks.length && blocks[blocks.length - 1].type !== "spacer") blocks.push({ type: "spacer" });
      index += 1;
      continue;
    }
    // Una línea con sangría y sin viñeta sigue a la viñeta de arriba (el modelo a veces parte así un renglón).
    if (list.length && /^\s+\S/.test(raw)) {
      list[list.length - 1].text += ` ${clean.trim()}`;
      index += 1;
      continue;
    }
    flushList();
    blocks.push({ type: "paragraph", text: clean.trim() });
    index += 1;
  }
  flushList();
  while (blocks.length && blocks[blocks.length - 1].type === "spacer") blocks.pop();
  return { blocks, next: lines.length, closed: false };
}

/** Las piezas de una línea: texto con negrita y citas, o una etiqueta. */
export type InlinePiece = { type: "text"; text: string } | { type: "tag"; label: string };

const TAG = /\[\[tag:([^\]]{1,40})\]\]/g;

export function splitTags(text: string): InlinePiece[] {
  const pieces: InlinePiece[] = [];
  let last = 0;
  const pattern = new RegExp(TAG.source, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) pieces.push({ type: "text", text: text.slice(last, match.index) });
    pieces.push({ type: "tag", label: match[1].trim() });
    last = match.index + match[0].length;
  }
  if (last < text.length) pieces.push({ type: "text", text: text.slice(last) });
  return pieces;
}

/** Lo que va al portapapeles: sin etiquetas (la negrita la resuelve quien lo convierte a HTML o a texto). */
export function plainCopyText(text: string): string {
  return text
    .split("\n")
    .map(stripInternalMarks)
    .join("\n")
    .replace(new RegExp(TAG.source, "g"), "")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

// ── Piezas para armar respuestas desde el código (kits hoy, precios después) ──

export const tag = (label: string) => `[[tag:${label}]]`;
export const heading = (text: string, level: 2 | 3 = 2) => `${"#".repeat(level)} ${text}`;
/** La línea clave: los números importantes, en negrita el primero, separados por «·». */
export const keyLine = (first: string, rest: readonly string[]) => [`**${first}**`, ...rest].join(" · ");
export const bulletList = (items: readonly string[], depth = 0) => items.map((item) => `${"  ".repeat(depth)}- ${item}`).join("\n");
export const numberedList = (items: readonly string[]) => items.map((item, index) => `${index + 1}. ${item}`).join("\n");
export const collapsible = (title: string, body: string) => `:::detalle ${title}\n${body}\n:::`;
export const copyBlock = (title: string, body: string) => `:::copiar ${title}\n${body}\n:::`;
/** Las secciones separadas por una línea en blanco, sin las vacías. */
export const sections = (...parts: (string | null | undefined | false)[]) => parts.filter((part): part is string => Boolean(part && part.trim())).join("\n\n");
