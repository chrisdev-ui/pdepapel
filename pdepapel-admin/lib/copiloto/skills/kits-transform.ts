import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

import { foldText } from "@/lib/copiloto/skills/product-match";

export interface KitOutput {
  nombreSugerido?: string;
  detalle?: string;
  piezas?: { nombre?: string; rol?: string; precioEfectivo?: number }[];
  ahorroParaLaClienta?: number | null;
}

interface KitsToolOutput {
  datos?: { nuevosSinDatosDeVenta?: { linea?: string | null }; kits?: KitOutput[] };
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
 * Los números de cada kit los pone la herramienta, no el modelo. Por kit (sus
 * párrafos se reconocen como dice `belongsTo`): si muestran un monto
 * que la herramienta no dio, esas líneas con montos se quitan y en su lugar va
 * el `detalle`; si les falta el precio de alguna pieza o el ahorro, el
 * `detalle` va debajo; si no se nombra en ninguna parte, va al final.
 */
export function reconcileKitAnswer(text: string, kits: readonly KitOutput[]): string {
  let paragraphs = text.split(/\n{2,}/);
  const appended: string[] = [];
  for (const kit of kits) {
    if (!kit.detalle) continue;
    const allowed = new Set(amountsIn(kit.detalle));
    const needed = [...(kit.piezas ?? []).map((piece) => piece.precioEfectivo), kit.ahorroParaLaClienta]
      .filter((value): value is number => typeof value === "number")
      .map((value) => String(Math.round(value)));
    const own = paragraphs.map((paragraph, index) => (belongsTo(paragraph, kit) ? index : -1)).filter((index) => index >= 0);
    if (own.length === 0) {
      appended.push(heading(kit));
      continue;
    }
    const shown = own.flatMap((index) => amountsIn(paragraphs[index]));
    const foreign = shown.some((amount) => !allowed.has(amount));
    const complete = needed.every((amount) => shown.includes(amount));
    if (!foreign && complete) continue;
    if (foreign) {
      paragraphs = paragraphs.map((paragraph, index) =>
        own.includes(index)
          ? paragraph
              .split("\n")
              .filter((line) => amountsIn(line).length === 0)
              .join("\n")
          : paragraph,
      );
    }
    paragraphs.splice(own[0] + 1, 0, heading(kit));
    paragraphs = paragraphs.filter((paragraph) => paragraph.trim() !== "");
  }
  return [...paragraphs, ...appended].join("\n\n");
}

/**
 * Lo fijo de `kitsParaRotar` llega a la respuesta tal como lo armó la
 * herramienta: el detalle de cada borrador (ver `reconcileKitAnswer`) y la
 * línea de productos nuevos («Nuevos sin datos de venta: N …»). Para poder
 * corregir montos, el texto que el modelo escribe después de la herramienta
 * se guarda y sale entero al terminar, sin otra llamada al modelo.
 */
export function kitsAnswerTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    let before = "";
    let held = "";
    let holding = false;
    let line: string | null = null;
    let kits: KitOutput[] = [];
    let done = false;
    const finalText = () => {
      done = true;
      let text = holding ? reconcileKitAnswer(held, kits) : "";
      if (line) {
        const count = line.match(/\d+/)?.[0] ?? "";
        if (!foldText(before + text).includes(foldText(`Nuevos sin datos de venta: ${count}`))) text += `\n\n${line}`;
      }
      return holding ? text.replace(/^\n+/, "") : text;
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
          const found = datos?.nuevosSinDatosDeVenta?.linea;
          line = typeof found === "string" && found ? found : null;
          kits = Array.isArray(datos?.kits) ? datos.kits.filter((kit) => kit.detalle) : [];
          holding = kits.length > 0;
        }
        if (holding && (part.type === "text-start" || part.type === "text-end")) return;
        if (part.type === "text-delta") {
          if (holding) {
            held += part.text;
            return;
          }
          before += part.text;
        }
        if (part.type === "finish" && !done) emit(controller, finalText());
        controller.enqueue(part);
      },
      // Si el flujo se corta sin «finish», lo guardado no se pierde.
      flush(controller) {
        if (!done && holding) emit(controller, finalText());
      },
    });
  };
}
