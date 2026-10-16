// Sin dependencias de servidor: lo usan la ficha de producto (navegador) y el Copiloto.
import { INITIAL_PERCENTAGE_INCREASE } from "@/constants";
import { isKnownTransport } from "@/lib/product-costs";
import {
  getMercadoLibreMarginBreakdown,
  MERCADOLIBRE_FEE_RATE_ESTIMATE,
  MERCADOLIBRE_SHIPPING_ESTIMATE,
  suggestMercadoLibrePrice,
} from "@/lib/mercadolibre/listing-margin";

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

export interface MercadoLibreFeeSettings {
  /** Cargo fijo por unidad en precios bajos (en vez del envío); null = no registrado. */
  lowPriceFixedFee: number | null;
  /** Precio hasta el cual se cobra el cargo fijo en vez del envío; null = no registrado. */
  freeShippingMin: number | null;
}

export interface MercadoLibreEstimate {
  price: number;
  commission: number;
  fixedFee: number;
  shipping: number;
  withholding: number;
  net: number | null;
  marginPct: number | null;
  /** Sin los dos ajustes de Mercado Libre: el cargo fijo no se pudo incluir. */
  withoutFixedFee: boolean;
}

/**
 * Lo que deja una venta en Mercado Libre, siempre como estimado. Por encima del
 * umbral se paga la comisión estimada y el envío estimado. Hasta el umbral (con
 * los dos ajustes registrados) no hay envío a cargo de la vendedora: se cobra el
 * cargo fijo por unidad, que en precios muy bajos no pasa de la mitad del
 * precio (lo que mostraron las ventas y el simulador de la cuenta, 2026-10-17).
 */
export function mercadoLibreEstimate(price: number, unitCost: number | null, settings: MercadoLibreFeeSettings): MercadoLibreEstimate {
  const configured = settings.lowPriceFixedFee !== null && settings.freeShippingMin !== null;
  const lowPrice = configured && price <= (settings.freeShippingMin as number);
  const fixedFee = lowPrice ? Math.min(settings.lowPriceFixedFee as number, Math.round(price / 2)) : 0;
  const commission = Math.round(price * MERCADOLIBRE_FEE_RATE_ESTIMATE);
  const breakdown = getMercadoLibreMarginBreakdown({ price, feeAmount: commission + fixedFee, shippingCost: lowPrice ? 0 : MERCADOLIBRE_SHIPPING_ESTIMATE, unitCost });
  return {
    price,
    commission,
    fixedFee,
    shipping: breakdown.shipping,
    withholding: breakdown.withholding,
    net: breakdown.net === null ? null : Math.round(breakdown.net),
    marginPct: breakdown.marginRate === null ? null : round1(breakdown.marginRate * 100),
    withoutFixedFee: !configured,
  };
}

/** Precio sugerido en Mercado Libre (…900) con las metas de la tienda; null si no hay precio que las cumpla. */
export function suggestMercadoLibreStorePrice(unitCost: number, targets: { targetMarginPercent: number; minNetPerUnit: number }) {
  return suggestMercadoLibrePrice({
    unitCost,
    shippingCost: MERCADOLIBRE_SHIPPING_ESTIMATE,
    feeRate: MERCADOLIBRE_FEE_RATE_ESTIMATE,
    targetNet: targets.minNetPerUnit,
    targetMarginRate: targets.targetMarginPercent / 100,
  });
}
