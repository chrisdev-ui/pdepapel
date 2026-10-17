// Sin dependencias de servidor: lo usan el asistente de publicación (navegador), el Copiloto y el panel.
import {
  getMercadoLibreMarginBreakdown,
  MERCADOLIBRE_SHIPPING_ESTIMATE,
  roundToFriendlyPrice,
} from "@/lib/mercadolibre/listing-margin";

/**
 * Comisión por tipo de publicación en las categorías de papelería y escritura
 * (cuenta de la tienda, 2026-10-17): Clásica sin cuotas extra 16 %, Premium
 * con cuotas extra («Hasta 6 con 0% interés») 19 %. Es un estimado: la real
 * sale de `listing_prices` cuando hay categoría y conexión.
 */
export const MERCADOLIBRE_LISTING_TYPE_RATES = {
  gold_special: { pct: 16, label: "sin cuotas extra" },
  gold_pro: { pct: 19, label: "con cuotas extra" },
} as const;
export type KnownListingType = keyof typeof MERCADOLIBRE_LISTING_TYPE_RATES;
export const KNOWN_LISTING_TYPES = Object.keys(MERCADOLIBRE_LISTING_TYPE_RATES) as KnownListingType[];

export type SaleFeeSource =
  /** La comisión que devolvió `listing_prices`: porcentaje (en %) y cargo fijo de la comisión, si lo hay. */
  | { kind: "real"; percentageFee: number; fixedFee: number; listingType: string | null }
  /** El estimado del tipo de publicación. */
  | { kind: "tipo"; listingType: string | null };

export function saleFeeAt(price: number, source: SaleFeeSource) {
  if (source.kind === "real") {
    return { amount: Math.round((price * source.percentageFee) / 100) + Math.round(source.fixedFee), pct: source.percentageFee, kind: "real" as const, listingType: source.listingType };
  }
  const type = (source.listingType && source.listingType in MERCADOLIBRE_LISTING_TYPE_RATES ? source.listingType : "gold_special") as KnownListingType;
  const pct = MERCADOLIBRE_LISTING_TYPE_RATES[type].pct;
  return { amount: Math.round((price * pct) / 100), pct, kind: "tipo" as const, listingType: type };
}

/** Lo que devolvió `listing_prices` como fuente reutilizable a otros precios; null si no trae el porcentaje. */
export function feeSourceFromQuote(quote: { percentageFee: number | null; fixedFee: number | null; listingTypeId: string | null } | null): SaleFeeSource | null {
  if (!quote || typeof quote.percentageFee !== "number" || !Number.isFinite(quote.percentageFee)) return null;
  return { kind: "real", percentageFee: quote.percentageFee, fixedFee: quote.fixedFee ?? 0, listingType: quote.listingTypeId };
}

export interface LowPriceRule {
  /** Cargo fijo por unidad que se cobra EN VEZ del envío hasta el precio límite; null = no registrado. */
  lowPriceFixedFee: number | null;
  /** Precio límite (incluido) del cargo fijo; null = no registrado. */
  freeShippingMin: number | null;
}

export interface MercadoLibreEstimate {
  price: number;
  /** Comisión de venta (porcentaje y, si la hay, su parte fija). */
  commission: number;
  commissionPct: number;
  commissionKind: "real" | "tipo";
  listingType: string | null;
  /** Cargo fijo de precios bajos (en vez del envío); 0 por encima del límite. */
  fixedFee: number;
  shipping: number;
  withholding: number;
  net: number | null;
  marginPct: number | null;
  /** Sin los dos ajustes de precios bajos: se estimó con envío a cualquier precio. */
  withoutFixedFee: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Lo que deja una venta en Mercado Libre. Una sola regla para todo el panel:
 * hasta el precio límite (con los dos ajustes) se cobra el cargo fijo por
 * unidad, como mucho la mitad del precio, EN VEZ del envío; por encima se paga
 * el envío (el cotizado, o el estimado) y no hay cargo fijo. Más la comisión
 * (real o del tipo de publicación) y la retención estimada.
 */
export function mercadoLibreNetAt({
  price,
  unitCost,
  fee,
  rule,
  shippingCost = MERCADOLIBRE_SHIPPING_ESTIMATE,
}: {
  price: number;
  unitCost: number | null;
  fee: SaleFeeSource;
  rule: LowPriceRule;
  shippingCost?: number;
}): MercadoLibreEstimate {
  const configured = rule.lowPriceFixedFee !== null && rule.freeShippingMin !== null;
  const lowPrice = configured && price <= (rule.freeShippingMin as number);
  const fixedFee = lowPrice ? Math.min(rule.lowPriceFixedFee as number, Math.round(price / 2)) : 0;
  const commission = saleFeeAt(price, fee);
  const breakdown = getMercadoLibreMarginBreakdown({ price, feeAmount: commission.amount + fixedFee, shippingCost: lowPrice ? 0 : shippingCost, unitCost });
  return {
    price,
    commission: commission.amount,
    commissionPct: commission.pct,
    commissionKind: commission.kind,
    listingType: commission.listingType,
    fixedFee,
    shipping: breakdown.shipping,
    withholding: breakdown.withholding,
    net: breakdown.net === null ? null : Math.round(breakdown.net),
    marginPct: breakdown.marginRate === null ? null : round1(breakdown.marginRate * 100),
    withoutFixedFee: !configured,
  };
}

export interface MercadoLibreTargets {
  /** Ganancia neta mínima por unidad, en COP. */
  targetNet: number;
  /** Margen neto mínimo sobre el precio (0–1). */
  targetMarginRate: number;
}

const MAX_SUGGESTION_STEPS = 600;

/**
 * El menor precio terminado en 900 cuyo neto cumple el mayor de los dos
 * objetivos, con la misma regla de `mercadoLibreNetAt` (cargo fijo hasta el
 * límite, envío por encima). Se recorre desde abajo porque cruzar el límite
 * puede bajar el neto: no hay fórmula cerrada. Null si no hay precio que cumpla.
 */
export function suggestMercadoLibrePriceWithRule({
  unitCost,
  fee,
  rule,
  targets,
  shippingCost,
}: {
  unitCost: number;
  fee: SaleFeeSource;
  rule: LowPriceRule;
  targets: MercadoLibreTargets;
  shippingCost?: number;
}): number | null {
  const meets = (price: number) => {
    const estimate = mercadoLibreNetAt({ price, unitCost, fee, rule, shippingCost });
    return estimate.net !== null && estimate.net >= Math.max(targets.targetNet, targets.targetMarginRate * price);
  };
  let price = roundToFriendlyPrice(Math.max(unitCost, 1));
  for (let step = 0; step < MAX_SUGGESTION_STEPS; step += 1) {
    if (meets(price)) return price;
    price += 1_000;
  }
  return null;
}
