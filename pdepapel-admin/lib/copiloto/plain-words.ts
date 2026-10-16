import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

/**
 * Paula no ve nombres de herramientas ni términos internos: cada respuesta
 * pasa por este cambio de palabras, en el código y no en el prompt. Solo
 * cadenas exactas (no toca nombres de productos ni las citas
 * «[conocimiento: id]»). Lo más largo va primero para que «suma de precios
 * efectivos» gane a «precios efectivos».
 */
const TOOL_WORDS: Record<string, string> = {
  resumenDeHoy: "el resumen de hoy",
  resumenFinancieroMes: "las finanzas del mes",
  compararMeses: "la comparación de meses",
  ventasDelDiaPuntoDeVenta: "las ventas del punto de venta",
  buscarProductos: "el catálogo",
  detalleProducto: "la ficha del producto",
  kardexProducto: "los movimientos del producto",
  porReponer: "lo que hay que reponer",
  riesgoInventario: "el inventario en riesgo",
  reporteTributario: "el reporte tributario",
  saludMercadoLibre: "el estado de Mercado Libre",
  productosParaPromocionar: "la regla de campañas",
  cargarHabilidad: "la habilidad",
  productoParaDescripcion: "la ficha del producto",
  kitsParaRotar: "el inventario",
  textosDeKits: "los textos de los kits",
  calcularPrecio: "la calculadora de precios",
  compararPacks: "la comparación de packs",
  margenesBajoMinimo: "los márgenes de la tienda",
};

const FIELD_WORDS: Record<string, string> = {
  plataQuietaACostoTotal: "plata quieta a costo",
  plataQuietaACosto: "plata quieta a costo",
  lentosSinCosto: "quietos sin costo",
  nombreSugerido: "nombre",
  precioSugerido: "precio sugerido",
  kitsArmables: "kits que alcanzan",
  sumaPreciosEfectivos: "precio por separado",
  margenPct: "margen",
  ahorroPct: "ahorro",
};

const PHRASES: [string, string][] = [
  ["la suma de precios efectivos", "el precio por separado"],
  ["La suma de precios efectivos", "El precio por separado"],
  ["suma de precios efectivos", "precio por separado"],
  ["Suma de precios efectivos", "Precio por separado"],
  ["precios efectivos", "precios actuales"],
  ["Precios efectivos", "Precios actuales"],
  ["precio efectivo", "precio actual"],
  ["Precio efectivo", "Precio actual"],
  ["Según la herramienta", "Según tus datos"],
  ["según la herramienta", "según tus datos"],
  [" (lento)", " (quieto)"],
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ENTRIES: [RegExp, string][] = [
  ...Object.entries({ ...TOOL_WORDS, ...FIELD_WORDS })
    .sort((a, b) => b[0].length - a[0].length)
    .map(([word, plain]): [RegExp, string] => [new RegExp(`(?<![\\w-])${escape(word)}(?![\\w-])`, "g"), plain]),
  ...PHRASES.sort((a, b) => b[0].length - a[0].length).map(([phrase, plain]): [RegExp, string] => [new RegExp(escape(phrase), "g"), plain]),
];
/** Lo más largo que puede partirse entre dos pedazos del flujo. */
const LONGEST = Math.max(...Object.keys({ ...TOOL_WORDS, ...FIELD_WORDS }).map((word) => word.length), ...PHRASES.map(([phrase]) => phrase.length)) + 2;

/** Los nombres de herramientas y campos que nunca deben verse. */
export const INTERNAL_WORDS: readonly string[] = [...Object.keys(TOOL_WORDS), ...Object.keys(FIELD_WORDS), ...PHRASES.map(([phrase]) => phrase.trim())];

// «de el resumen de hoy» → «del resumen de hoy», solo con lo que puso este cambio.
const MASCULINE = Array.from(new Set(Object.values({ ...TOOL_WORDS, ...FIELD_WORDS }).filter((plain) => plain.startsWith("el ")).map((plain) => escape(plain.slice(3)))));
const CONTRACTION = new RegExp(`(^|[\\s(«"])(de|De|a|A) el (${MASCULINE.join("|")})(?![\\wáéíóúñ])`, "g");

export function toPlainWords(text: string): string {
  const replaced = ENTRIES.reduce((current, [pattern, plain]) => current.replace(pattern, plain), text);
  return replaced.replace(CONTRACTION, (_match, before: string, word: string, rest: string) => `${before}${word.toLowerCase() === "de" ? (word === "De" ? "Del" : "del") : word === "A" ? "Al" : "al"} ${rest}`);
}

/** Dónde cortar sin partir una coincidencia: hasta `limit`, o antes si una empieza antes y termina después. */
function safeCut(text: string, limit: number): number {
  let cut = limit;
  for (const [pattern] of ENTRIES) {
    const regex = new RegExp(pattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text))) {
      if (match.index < cut && match.index + match[0].length > cut) cut = match.index;
      if (match.index >= limit) break;
    }
  }
  return cut;
}

/**
 * En el flujo: guarda la cola de cada texto (lo bastante larga para que un
 * nombre partido en dos pedazos se reconozca) y suelta lo demás ya cambiado.
 */
export function plainWordsTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    const pending = new Map<string, string>();
    const release = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>, id: string, all: boolean) => {
      const text = pending.get(id) ?? "";
      const cut = all ? text.length : safeCut(text, text.length - LONGEST);
      if (cut <= 0) return;
      pending.set(id, text.slice(cut));
      controller.enqueue({ type: "text-delta", id, text: toPlainWords(text.slice(0, cut)) } as TextStreamPart<TOOLS>);
    };
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "text-delta") {
          pending.set(part.id, (pending.get(part.id) ?? "") + part.text);
          release(controller, part.id, false);
          return;
        }
        if (part.type === "text-end") release(controller, part.id, true);
        if (part.type === "finish") for (const id of Array.from(pending.keys())) release(controller, id, true);
        controller.enqueue(part);
      },
      flush(controller) {
        for (const id of Array.from(pending.keys())) release(controller, id, true);
      },
    });
  };
}
