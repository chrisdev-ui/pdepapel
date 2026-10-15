import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

export interface KitOutput {
  nombreSugerido?: string;
  /** Lo que el modelo escribe donde va el detalle; el chat lo cambia por `detalle`. */
  marcador?: string;
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

/** Cada número y cada monto de la salida de la herramienta: son los únicos montos que la respuesta puede traer. */
export function toolAmounts(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "number" && Number.isFinite(value)) found.add(String(Math.round(value)));
  else if (typeof value === "string") amountsIn(value).forEach((amount) => found.add(amount));
  else if (Array.isArray(value)) value.forEach((item) => toolAmounts(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => toolAmounts(item, found));
  return found;
}

export const kitMarker = (index: number) => `[[KIT-${index + 1}]]`;
const MARKER = /\[\[KIT-\d+\]\]/g;
const HAS_MARKER = /\[\[KIT-\d+\]\]/;
const PIECE_LINE = /\((lento|se vende)\):/;
const WHY_LINE = /^\s*(?:[-*]\s+)?(?:\*\*)?\s*(?:por qu[eé]|funciona porque)(?![a-záéíóúüñ0-9])/i;
const indentOf = (line: string) => line.match(/^\s*/)![0].length;

const titleOf = (kit: KitOutput) => `- **${kit.nombreSugerido ?? "Kit"}**`;
const heading = (kit: KitOutput) => `**Detalle de «${kit.nombreSugerido ?? "kit"}»**\n${kit.detalle}`;

/**
 * El modelo escribe la viñeta de cada kit y debajo su marcador (`[[KIT-1]]`);
 * aquí el marcador se cambia por el `detalle` de la herramienta, tal cual (las
 * piezas, los precios, las cuentas y el porqué no son del modelo). Lo que el
 * modelo escriba de eso por su cuenta se quita: líneas de piezas, líneas del
 * detalle copiadas, su propio «Por qué» con lo que cuelga de él y cualquier
 * línea con un monto que la herramienta no dio. Un kit cuyo marcador no
 * aparece va al final, una vez, con su título.
 */
export function reconcileKitAnswer(text: string, kits: readonly KitOutput[], allowed: ReadonlySet<string> = toolAmounts(kits)): string {
  const byMarker = new Map(kits.filter((kit) => kit.detalle && kit.marcador).map((kit) => [kit.marcador!, kit]));
  const detailLines = new Set(Array.from(byMarker.values()).flatMap((kit) => kit.detalle!.split("\n").map((line) => line.trim())));
  const placed = new Set<string>();
  const out: string[] = [];
  let skipBelow: number | null = null;

  for (const line of text.split("\n")) {
    if (skipBelow !== null && line.trim() !== "" && indentOf(line) > skipBelow) continue;
    skipBelow = null;
    if (HAS_MARKER.test(line)) {
      const markers = (line.match(MARKER) ?? []).filter((marker) => byMarker.has(marker) && !placed.has(marker));
      const rest = line.replace(MARKER, "").trimEnd();
      const kit = markers.length ? byMarker.get(markers[0])! : null;
      const last = out[out.length - 1];
      if (kit && rest.trim()) out.push(amountsIn(rest).length ? titleOf(kit) : rest);
      else if (kit && last !== undefined && /^[-*] /.test(last)) out[out.length - 1] = amountsIn(last).length ? titleOf(kit) : last;
      else if (kit) out.push(titleOf(kit));
      else if (rest.trim() && !amountsIn(rest).some((amount) => !allowed.has(amount))) out.push(rest);
      for (const marker of markers) {
        out.push(byMarker.get(marker)!.detalle!);
        placed.add(marker);
      }
      continue;
    }
    if (line.trim() && (detailLines.has(line.trim()) || PIECE_LINE.test(line))) continue;
    if (WHY_LINE.test(line)) {
      skipBelow = indentOf(line);
      continue;
    }
    if (amountsIn(line).some((amount) => !allowed.has(amount))) continue;
    out.push(line);
  }

  const missing = Array.from(byMarker).filter(([marker]) => !placed.has(marker)).map(([, kit]) => heading(kit));
  return [out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), ...missing].filter((part) => part !== "").join("\n\n");
}

/**
 * Lo fijo de `kitsParaRotar` llega a la respuesta tal como lo armó la
 * herramienta: el detalle de cada borrador en su marcador (ver `reconcileKitAnswer`) y las
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
    let allowed = new Set<string>();
    let done = false;
    const finalText = () => {
      done = true;
      return placeFixedLines(kits.length ? reconcileKitAnswer(held, kits, allowed) : held, fixed).replace(/^\n+/, "");
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
          allowed = toolAmounts(part.output);
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
