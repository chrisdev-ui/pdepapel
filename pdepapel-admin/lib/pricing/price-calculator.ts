// Sin dependencias de servidor: lo usan la ficha de producto (navegador) y el Copiloto.
import { INITIAL_PERCENTAGE_INCREASE } from "@/constants";
import { isKnownTransport } from "@/lib/product-costs";

import { mercadoLibreNetAt, suggestMercadoLibrePriceWithRule, type LowPriceRule, type MercadoLibreEstimate, type SaleFeeSource } from "./mercadolibre-fees";
import { ceilPeso } from "./rounding";

/** Aumento cuando no hay ningún producto con costo para comparar. */
export const DEFAULT_MARKUP_PCT = INITIAL_PERCENTAGE_INCREASE;

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Costo de una unidad puesta en la tienda: compra + envío por unidad (si es real). Null sin costo de compra. */
export function landedCost(acqPrice: number | null | undefined, transportationCost: number | null | undefined): number | null {
  if (typeof acqPrice !== "number" || !Number.isFinite(acqPrice) || acqPrice <= 0) return null;
  return acqPrice + (isKnownTransport(transportationCost) ? (transportationCost as number) : 0);
}

/** Precio sugerido de la tienda: costo con envío × (1 + aumento), al peso. 0 sin costo. */
export function suggestStorePrice(cost: number | null, markupPct: number): number {
  if (cost === null || !(cost > 0)) return 0;
  return Math.round(cost * (1 + markupPct / 100));
}

/** Margen bruto sobre el precio, en %: (precio − costo) / precio. */
export function marginOnPrice(price: number, cost: number): number | null {
  if (!(price > 0)) return null;
  return round1(((price - cost) / price) * 100);
}

/** Aumento sobre el costo que tiene hoy un precio, en %: precio / costo − 1. */
export function markupOf(price: number, cost: number): number | null {
  if (!(cost > 0) || !(price > 0)) return null;
  return (price / cost - 1) * 100;
}

/** El menor precio, al peso, cuyo margen sobre el precio llega a `marginPct`. Null si el margen no es alcanzable. */
export function priceToReachMargin(cost: number, marginPct: number): number | null {
  if (!(cost > 0) || !(marginPct >= 0) || marginPct >= 100) return null;
  return ceilPeso(cost / (1 - marginPct / 100));
}

export interface ProductMargin {
  /** Costo por unidad usado: compra (o piezas del kit) + envío por unidad si es real. */
  cost: number;
  /** El envío por unidad entró al costo; false si no está registrado (el margen real puede ser menor). */
  shippingIncluded: boolean;
  marginPct: number;
  profit: number;
  /** Margen mínimo de la tienda; null si no hay mínimo configurado. */
  minimum: { marginPct: number; price: number | null; below: boolean } | null;
  /**
   * Regla del guardado (aprobada 2026-10-17): por debajo de la compra se
   * bloquea (`isPriceBelowCost`); entre la compra y compra + envío es solo un
   * aviso («Con el envío, este precio queda por debajo del costo»).
   */
  belowCostWithShipping: boolean;
}

/**
 * Margen bruto de un producto sobre su precio, con la misma definición que el
 * precio sugerido y el Copiloto: (precio − compra − envío por unidad) ÷ precio.
 * Un kit usa el costo de sus piezas. Sin costo de compra no hay margen (null).
 */
export function productMargin({
  price,
  acqPrice,
  transportationCost,
  kitCost = null,
  minMarginPct = null,
}: {
  price: number;
  acqPrice: number | null | undefined;
  transportationCost: number | null | undefined;
  kitCost?: number | null;
  minMarginPct?: number | null;
}): ProductMargin | null {
  if (!(price > 0)) return null;
  const purchase = kitCost ?? acqPrice ?? null;
  if (typeof purchase !== "number" || !(purchase > 0)) return null;
  const shippingIncluded = kitCost === null && isKnownTransport(transportationCost);
  const cost = purchase + (shippingIncluded ? (transportationCost as number) : 0);
  const marginPct = marginOnPrice(price, cost) as number;
  const minimum =
    typeof minMarginPct === "number" && Number.isFinite(minMarginPct)
      ? { marginPct: minMarginPct, price: priceToReachMargin(cost, minMarginPct), below: (price - cost) / price < minMarginPct / 100 }
      : null;
  return { cost, shippingIncluded, marginPct, profit: Math.round((price - cost) * 100) / 100, minimum, belowCostWithShipping: price >= purchase && price < cost };
}

/** Los dos ajustes de precios bajos de Configuración, con el nombre de siempre. */
export type MercadoLibreFeeSettings = LowPriceRule;
export type { MercadoLibreEstimate } from "./mercadolibre-fees";

/**
 * Lo que deja una venta en Mercado Libre, siempre con la regla compartida
 * (`lib/pricing/mercadolibre-fees.ts`). Sin fuente de comisión, la de
 * Clásica sin cuotas extra.
 */
export function mercadoLibreEstimate(
  price: number,
  unitCost: number | null,
  settings: MercadoLibreFeeSettings,
  fee: SaleFeeSource = { kind: "tipo", listingType: "gold_special" },
): MercadoLibreEstimate {
  return mercadoLibreNetAt({ price, unitCost, fee, rule: settings });
}

/** Precio sugerido en Mercado Libre (…900) con las metas de la tienda y la misma regla; null si no hay precio que las cumpla. */
export function suggestMercadoLibreStorePrice(
  unitCost: number,
  targets: { targetMarginPercent: number; minNetPerUnit: number },
  settings: MercadoLibreFeeSettings = { lowPriceFixedFee: null, freeShippingMin: null },
  fee: SaleFeeSource = { kind: "tipo", listingType: "gold_special" },
) {
  return suggestMercadoLibrePriceWithRule({
    unitCost,
    fee,
    rule: settings,
    targets: { targetNet: targets.minNetPerUnit, targetMarginRate: targets.targetMarginPercent / 100 },
  });
}
