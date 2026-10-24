import { marginAfterBold, minimumPriceAfterBold, minimumPriceBeforeBold } from "./kit-price";
import { marginOnPrice } from "./price-calculator";

/**
 * La vista «Margen bajo» de Productos (solo lectura). El precio que cuenta es
 * el de hoy en la tienda (la mejor oferta vigente), el costo es el de la ficha
 * (compra + envío por unidad; un kit, la suma de sus piezas) y el mínimo de la
 * tienda se exige antes de Bold, como en `precioDeKit`. El margen después de
 * Bold es el de un cobro de una sola unidad: el fijo de Bold entero sobre un
 * producto.
 */

export type LowMarginClass = "oferta-bajo-costo" | "bajo-costo" | "bajo-minimo" | "solo-bold" | "cumple" | "sin-costo";

/** Las secciones de la vista, en orden. «Kits» junta los kits de cualquier clase. */
export type LowMarginSection = "oferta-bajo-costo" | "bajo-costo" | "bajo-minimo" | "solo-bold" | "kits";

export const LOW_MARGIN_SECTIONS: readonly LowMarginSection[] = ["oferta-bajo-costo", "bajo-costo", "bajo-minimo", "solo-bold", "kits"];

export interface LowMarginInput {
  id: string;
  name: string;
  categoryName: string | null;
  /** Precio de lista. */
  price: number;
  /** Precio de hoy con la mejor oferta vigente; igual al de lista sin oferta. */
  effectivePrice: number;
  offerLabel: string | null;
  /** Costo por unidad; null si falta el de compra (o el de alguna pieza de un kit). */
  cost: number | null;
  isKit: boolean;
}

export interface LowMarginRow {
  id: string;
  nombre: string;
  categoria: string | null;
  precio: number;
  /** Precio con la oferta; null sin oferta vigente. */
  precioOferta: number | null;
  oferta: string | null;
  costo: number | null;
  margenPct: number | null;
  /** Si pagan con Bold un pedido de solo esta unidad. */
  margenBoldPct: number | null;
  /** El precio terminado en 900 más bajo que llega al mínimo antes de Bold. */
  precioParaMinimo: number | null;
  /** El mismo, pero después de Bold en un cobro de una sola unidad. */
  precioParaMinimoConBold: number | null;
  clase: LowMarginClass;
  esKit: boolean;
}

export function classifyLowMargin(input: LowMarginInput, minMarginPct: number | null): LowMarginRow {
  const { cost, effectivePrice: price } = input;
  const withOffer = price < input.price;
  const margin = cost === null ? null : marginOnPrice(price, cost);
  const marginBold = cost === null ? null : marginAfterBold(price, cost);
  const clase: LowMarginClass =
    cost === null || margin === null
      ? "sin-costo"
      : price < cost
        ? withOffer && input.price >= cost
          ? "oferta-bajo-costo"
          : "bajo-costo"
        : minMarginPct === null
          ? "cumple"
          : margin < minMarginPct
            ? "bajo-minimo"
            : marginBold !== null && marginBold < minMarginPct
              ? "solo-bold"
              : "cumple";
  return {
    id: input.id,
    nombre: input.name,
    categoria: input.categoryName,
    precio: input.price,
    precioOferta: withOffer ? price : null,
    oferta: withOffer ? input.offerLabel : null,
    costo: cost === null ? null : Math.round(cost),
    margenPct: margin,
    margenBoldPct: marginBold,
    precioParaMinimo: cost === null || minMarginPct === null ? null : minimumPriceBeforeBold(cost, minMarginPct),
    precioParaMinimoConBold: cost === null || minMarginPct === null ? null : minimumPriceAfterBold(cost, minMarginPct),
    clase,
    esKit: input.isKit,
  };
}

/** La sección donde aparece una fila; null si no aparece (cumple o sin costo). Los kits van siempre a «Kits». */
export function sectionOf(row: Pick<LowMarginRow, "clase" | "esKit">): LowMarginSection | null {
  if (row.esKit) return "kits";
  return row.clase === "cumple" || row.clase === "sin-costo" ? null : row.clase;
}

/** Peor margen primero; a igual margen, por nombre. Sin costo al final. */
export function compareLowMargin(a: LowMarginRow, b: LowMarginRow): number {
  const left = a.margenPct ?? Infinity;
  const right = b.margenPct ?? Infinity;
  return left - right || a.nombre.localeCompare(b.nombre, "es");
}
