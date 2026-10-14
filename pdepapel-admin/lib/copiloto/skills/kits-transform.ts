import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

import { foldText } from "@/lib/copiloto/skills/product-match";

export interface KitOutput {
  nombreSugerido?: string;
  detalle?: string;
  piezas?: { nombre?: string; rol?: string; precioEfectivo?: number }[];
  ahorroParaLaClienta?: number | null;
}

interface KitsToolOutput {
  datos?: { nuevosSinDatosDeVenta?: { linea?: string | null }; quietosDeBajoValor?: { linea?: string | null }; kits?: KitOutput[] };
}

/** Una línea fija del final y cómo reconocer lo que el modelo haya escrito en su lugar (con la misma cuenta). */
interface FixedLine {
  text: string;
  topic: RegExp;
}

const FIXED_TOPICS = {
  nuevos: /\bnuev[oa]s?\b|sin (suficientes )?datos de venta/i,
  bajoValor: /bajo valor/i,
};

/**
 * Quita las frases que dicen lo mismo que una línea fija (su tema y su cuenta)
 * y pone la línea fija una sola vez al final. Anclado a la cuenta para no
 * borrar otras frases del tema.
 */
export function placeFixedLines(text: string, fixed: readonly FixedLine[]): string {
  if (fixed.length === 0) return text;
  const rewritten = text
    .split("\n")
    .map((line) => {
      const sentences = line.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((sentence) => !fixed.some((item) => {
        const count = item.text.match(/\d+/)?.[0];
        return count !== undefined && new RegExp(`(?<![\\d.,])${count}(?!\\d|[.,]\\d)`).test(sentence) && item.topic.test(sentence);
      }));
      return kept.length === sentences.length ? line : kept.join(" ");
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return [rewritten, ...fixed.map((item) => item.text)].filter((part) => part.trim() !== "").join("\n\n");
}

const AMOUNT = /\$\s?\d{1,3}(?:[.,]\d{3})+|\$\s?\d+/g;
const amountsIn = (text: string) => Array.from(text.matchAll(AMOUNT), (match) => match[0].replace(/\D+/g, ""));

const DETAIL_PREFIX = "**Detalle de «";

/**
 * Un párrafo es de un kit si nombra una de sus piezas lentas y una de las que
 * se venden. Las lentas no se repiten entre kits (las que se venden sí), así
 * que otro kit con las mismas piezas que se venden no cuenta, ni la lista de
 * lentos, ni un detalle ya puesto.
 */
const belongsTo = (paragraph: string, kit: KitOutput) => {
  if (paragraph.startsWith(DETAIL_PREFIX)) return false;
  const folded = foldText(paragraph);
  const named = (kit.piezas ?? []).filter((piece) => piece.nombre && folded.includes(foldText(piece.nombre)));
  return named.some((piece) => piece.rol === "lento") && named.some((piece) => piece.rol !== "lento");
};

const heading = (kit: KitOutput) => `${DETAIL_PREFIX}${kit.nombreSugerido ?? "kit"}»**\n${kit.detalle}`;

/**
 * El detalle de cada kit lo pone la herramienta, tal cual y con su sangría
 * (los precios, «comparte stock» y el porqué no son del modelo). Los párrafos
 * de cada kit se reconocen una sola vez sobre el texto del modelo (como dice
 * `belongsTo`, sin contar los nombres de kit entre «»), así lo que se inserta
 * para un kit no cambia a cuál pertenece un párrafo. Un kit que ya trae cada
 * línea de su detalle se deja; si no, de sus párrafos salen las líneas con
 * montos (salvo las líneas exactas del detalle de otro kit) y su detalle va
 * justo debajo de su viñeta, o en un párrafo propio si no hay viñeta. Un kit
 * que no se nombra en ninguna parte va al final.
 */
export function reconcileKitAnswer(text: string, kits: readonly KitOutput[]): string {
  const paragraphs = text.split(/\n{2,}/);
  const withDetail = kits.filter((kit) => kit.detalle);
  const detailOf = (kit: KitOutput) => kit.detalle!.split("\n").map((line) => line.trimEnd());
  const unquoted = (value: string) => value.replace(/«[^»]*»/g, "");
  const owners = withDetail.map((kit) => paragraphs.map((paragraph, index) => (belongsTo(unquoted(paragraph), kit) ? index : -1)).filter((index) => index >= 0));
  const verbatim = withDetail.map((kit, k) => {
    const lines = new Set(owners[k].flatMap((index) => paragraphs[index].split("\n").map((line) => line.trimEnd())));
    return owners[k].length > 0 && detailOf(kit).every((line) => lines.has(line));
  });
  const keep = new Set(withDetail.flatMap((kit, k) => (verbatim[k] ? detailOf(kit) : [])));
  const lines = paragraphs.map((paragraph) => paragraph.split("\n"));
  const after: string[][] = paragraphs.map(() => []);
  const appended: string[] = [];

  const pending = withDetail.filter((_, k) => !verbatim[k] && owners[k].length > 0);
  // Primero se limpian los párrafos de todos los kits; después se insertan los detalles, para que uno no borre lo del otro.
  withDetail.forEach((kit, k) => {
    if (verbatim[k]) return;
    if (owners[k].length === 0) {
      appended.push(heading(kit));
      return;
    }
    const own = new Set(detailOf(kit));
    for (const index of owners[k]) {
      lines[index] = lines[index]
        .map((line) => (/^[-*] /.test(line) && amountsIn(line).length > 0 && !keep.has(line.trimEnd()) ? `- **${kit.nombreSugerido ?? "Kit"}**` : line))
        .filter((line) => !own.has(line.trimEnd()) && (keep.has(line.trimEnd()) || amountsIn(line).length === 0));
    }
  });
  for (const kit of pending) {
    const first = owners[withDetail.indexOf(kit)][0];
    const target = lines[first];
    const bullets = target.map((line, index) => (/^[-*] /.test(line) ? index : -1)).filter((index) => index >= 0);
    // La viñeta de este kit: la que nombra (fuera de «») la primera palabra de una de sus piezas lentas.
    const slowWords = (kit.piezas ?? []).filter((piece) => piece.rol === "lento" && piece.nombre).map((piece) => foldText(piece.nombre!).split(/\s+/)[0]);
    const mine = bullets.find((index) => slowWords.some((word) => foldText(unquoted(target[index])).includes(word))) ?? bullets[0];
    if (mine !== undefined) target.splice(mine + 1, 0, ...detailOf(kit));
    else after[first].push(heading(kit));
  }

  const out = lines.flatMap((paragraphLines, index) => [paragraphLines.join("\n"), ...after[index]]).filter((paragraph) => paragraph.trim() !== "");
  return [...out, ...appended].join("\n\n");
}

/**
 * Lo fijo de `kitsParaRotar` llega a la respuesta tal como lo armó la
 * herramienta: el detalle de cada borrador (ver `reconcileKitAnswer`) y las
 * líneas del final (quietos de bajo valor, productos nuevos), que el modelo no
 * debe escribir: si las dice con otras palabras, se quitan y queda la fija una
 * vez. Para poder corregir, el texto que el modelo escribe después de la
 * herramienta se guarda y sale entero al terminar, sin otra llamada al modelo.
 */
export function kitsAnswerTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    let held = "";
    let holding = false;
    let fixed: FixedLine[] = [];
    let kits: KitOutput[] = [];
    let done = false;
    const finalText = () => {
      done = true;
      return placeFixedLines(kits.length ? reconcileKitAnswer(held, kits) : held, fixed).replace(/^\n+/, "");
    };
    const emit = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>, text: string) => {
      if (!text.trim()) return;
      const id = "kits-fijo";
      controller.enqueue({ type: "text-start", id } as TextStreamPart<TOOLS>);
      controller.enqueue({ type: "text-delta", id, text } as TextStreamPart<TOOLS>);
      controller.enqueue({ type: "text-end", id } as TextStreamPart<TOOLS>);
    };
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "tool-result" && part.toolName === "kitsParaRotar") {
          const datos = (part.output as KitsToolOutput | undefined)?.datos;
          const line = (value: unknown, topic: RegExp) => (typeof value === "string" && value ? [{ text: value, topic }] : []);
          fixed = [...line(datos?.quietosDeBajoValor?.linea, FIXED_TOPICS.bajoValor), ...line(datos?.nuevosSinDatosDeVenta?.linea, FIXED_TOPICS.nuevos)];
          kits = Array.isArray(datos?.kits) ? datos.kits.filter((kit) => kit.detalle) : [];
          holding = kits.length > 0 || fixed.length > 0;
        }
        if (holding && (part.type === "text-start" || part.type === "text-end")) return;
        if (part.type === "text-delta" && holding) {
          held += part.text;
          return;
        }
        if (part.type === "finish" && !done && holding) emit(controller, finalText());
        controller.enqueue(part);
      },
      // Si el flujo se corta sin «finish», lo guardado no se pierde.
      flush(controller) {
        if (!done && holding) emit(controller, finalText());
      },
    });
  };
}
