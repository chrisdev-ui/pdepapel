import { PaymentMethod } from "@prisma/client";

import { availableStock, kitAvailableFromComponents } from "@/lib/available-stock";
import { priceKit, type KitPiece } from "@/lib/copiloto/kits-rotation";
import { BOLD_ONLINE_FEE, gatewayFee } from "@/lib/gateway-fees";
import { isKnownTransport } from "@/lib/product-costs";

import { landedCost, marginOnPrice } from "./price-calculator";
import { roundDown900, roundUp900 } from "./rounding";

/**
 * Precio de un kit que Paula arma con piezas que ella elige. El margen que se
 * muestra es el de la ficha de producto, (precio − costo) ÷ precio; el mínimo
 * de la tienda se exige en el peor caso, después de la comisión de Bold en
 * línea. Sin el costo de alguna pieza no hay margen ni precio mínimo.
 */

export interface KitPriceLine {
  productId: string;
  nombre: string;
  cantidad: number;
  acqPrice: number | null;
  transportationCost: number | null;
  /** Precio efectivo de una unidad (ofertas y escalas, cantidad 1), como en el checkout. */
  precioEfectivo: number;
  precioDeLista: number;
  stock: number;
  reservedUnits: number;
}

export type KitPriceOptionKind = "separado" | "descuento" | "minimo" | "rotar";

export interface KitPriceOption {
  kinds: KitPriceOptionKind[];
  precio: number;
  /** Margen como en la ficha de producto; null sin costo. */
  margenPct: number | null;
  /** Margen si la clienta paga con Bold en línea; null sin costo. */
  margenBoldPct: number | null;
  /** Cumple el mínimo después de Bold; null sin costo o sin mínimo configurado. */
  permitido: boolean | null;
}

export interface KitPriceResult {
  sumaPorSeparado: number;
  costoTotal: number | null;
  sinCostoDe: string[];
  sinTransporteDe: string[];
  kitsArmables: number;
  piezaQueLimita: string | null;
  opciones: KitPriceOption[];
  /** El precio más bajo que cumple el mínimo queda por encima de la suma de las piezas. */
  minimoSobreLaSuma: boolean;
}

/** Recargo sobre el costo del piso de `kitsParaRotar` (su `margenMinimo` por defecto). */
export const ROTATION_FLOOR_MARKUP_PCT = 20;

const round1 = (value: number) => Math.round(value * 10) / 10;

export function marginAfterBold(price: number, cost: number): number | null {
  if (!(price > 0)) return null;
  const fee = gatewayFee(price, PaymentMethod.Bold) ?? 0;
  return round1(((price - cost - fee) / price) * 100);
}

/**
 * El precio terminado en 900 más bajo cuyo margen después de Bold llega al
 * mínimo. La fórmula da el punto de partida y se comprueba con la comisión
 * real, que redondea a centavos. Null si el mínimo no es alcanzable.
 */
export function minimumPriceAfterBold(cost: number, minMarginPct: number): number | null {
  const fee = BOLD_ONLINE_FEE;
  const share = 1 - minMarginPct / 100 - fee.percent * (1 + fee.vat);
  if (!(cost > 0) || !(share > 0)) return null;
  let price = roundUp900((cost + fee.fixed * (1 + fee.vat)) / share);
  while ((marginAfterBold(price, cost) ?? -Infinity) < minMarginPct) price += 1000;
  return price;
}

export function lineUnitCost(line: Pick<KitPriceLine, "acqPrice" | "transportationCost">): number | null {
  return landedCost(line.acqPrice, line.transportationCost);
}

export function priceKitOptions(input: {
  lines: readonly KitPriceLine[];
  minMarginPct: number | null;
  discountPct: number;
  forRotation: boolean;
}): KitPriceResult {
  const { lines, minMarginPct, discountPct, forRotation } = input;
  const sum = Math.round(lines.reduce((total, line) => total + line.cantidad * line.precioEfectivo, 0));
  const sinCostoDe = lines.filter((line) => lineUnitCost(line) === null).map((line) => line.nombre);
  const sinTransporteDe = lines.filter((line) => lineUnitCost(line) !== null && !isKnownTransport(line.transportationCost)).map((line) => line.nombre);
  const cost = sinCostoDe.length ? null : Math.round(lines.reduce((total, line) => total + line.cantidad * (lineUnitCost(line) as number), 0));

  const kitsArmables = kitAvailableFromComponents(lines.map((line) => ({ quantity: line.cantidad, component: { stock: line.stock, reservedUnits: line.reservedUnits } })));
  const limiting = lines.find((line) => Math.floor(availableStock(line) / line.cantidad) === kitsArmables) ?? null;

  const option = (kind: KitPriceOptionKind, precio: number): KitPriceOption => {
    const margenBoldPct = cost === null ? null : marginAfterBold(precio, cost);
    return {
      kinds: [kind],
      precio,
      margenPct: cost === null ? null : marginOnPrice(precio, cost),
      margenBoldPct,
      permitido: cost === null || minMarginPct === null || margenBoldPct === null ? null : margenBoldPct >= minMarginPct,
    };
  };

  const candidates: KitPriceOption[] = [];
  const separate = roundDown900(sum);
  if (separate > 0) candidates.push(option("separado", separate));
  const discounted = roundDown900(sum * (1 - discountPct / 100));
  if (discounted > 0) candidates.push(option("descuento", discounted));
  const minimum = cost !== null && minMarginPct !== null ? minimumPriceAfterBold(cost, minMarginPct) : null;
  if (minimum !== null) candidates.push(option("minimo", minimum));
  if (forRotation && cost !== null) {
    // El mismo piso que `kitsParaRotar`: costo × (1 + recargo), subido al 900 siguiente.
    const pieces: KitPiece[] = lines.map((line) => ({
      productId: line.productId,
      nombre: line.nombre,
      rol: "lento",
      categoria: null,
      disponible: 0,
      precioEfectivo: line.cantidad * line.precioEfectivo,
      precioDeLista: line.cantidad * line.precioDeLista,
      oferta: null,
      costo: line.cantidad * (lineUnitCost(line) as number),
    }));
    const floor = priceKit(pieces, ROTATION_FLOOR_MARKUP_PCT, discountPct).floor;
    if (floor !== null) candidates.push({ ...option("rotar", roundUp900(floor)), permitido: null });
  }

  const opciones: KitPriceOption[] = [];
  for (const candidate of candidates) {
    const same = opciones.find((row) => row.precio === candidate.precio);
    if (same) same.kinds.push(...candidate.kinds);
    else opciones.push(candidate);
  }
  opciones.sort((a, b) => b.precio - a.precio);

  return {
    sumaPorSeparado: sum,
    costoTotal: cost,
    sinCostoDe,
    sinTransporteDe,
    kitsArmables,
    piezaQueLimita: lines.length > 1 && limiting ? limiting.nombre : null,
    opciones,
    minimoSobreLaSuma: minimum !== null && minimum > sum,
  };
}
