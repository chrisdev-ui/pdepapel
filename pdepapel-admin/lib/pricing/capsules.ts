import { PaymentMethod } from "@prisma/client";

import { gatewayFee } from "@/lib/gateway-fees";

/**
 * Precio y margen de las cápsulas por papeles. Puro, sin base de datos: la
 * comisión sale de `lib/gateway-fees.ts` y ninguna cifra de pasarela vive aquí.
 */

/**
 * Bandera de lanzamiento. Apagada: el checkout la valida en el servidor y la
 * tienda solo muestra la edición con el enlace firmado de vista previa.
 * Encenderla es un commit, después de la revisión legal.
 */
export const CAPSULE_SALES_ENABLED = false;

/** Pack mínimo y la parte de los papeles que quedan que puede llevarse un solo pack. */
export const CAPSULE_MIN_PACK = 5;
export const CAPSULE_MAX_PACK_SHARE = 0.25;

/** El tope de costo más alto de un regalo (el del pack de 30, combinado). */
export const CAPSULE_GIFT_MAX_COST = 6000;

export interface CapsulePackRung {
  packSize: number;
  /** Precio del pack. Es entero por cápsula para que `ProductPriceTier` lo represente exacto. */
  total: number;
  /** Tope de costo de los regalos (productos quietos) y cuántos puede llevar. */
  giftMaxCost: number;
  giftMaxItems: number;
  /** Reserva de caja/empaque por pack (no hay costo de caja en el código; supuesto de la validación). */
  boxCost: number;
}

/** La escalera aprobada (2026-10-20). */
export const CAPSULE_PACK_LADDER: readonly CapsulePackRung[] = [
  { packSize: 5, total: 64500, giftMaxCost: 0, giftMaxItems: 0, boxCost: 1000 },
  { packSize: 10, total: 124900, giftMaxCost: 2000, giftMaxItems: 1, boxCost: 1000 },
  { packSize: 15, total: 179850, giftMaxCost: 3000, giftMaxItems: 1, boxCost: 2000 },
  { packSize: 20, total: 234900, giftMaxCost: 4000, giftMaxItems: 1, boxCost: 2000 },
  { packSize: 25, total: 289900, giftMaxCost: 4000, giftMaxItems: 1, boxCost: 3000 },
  { packSize: 30, total: 339900, giftMaxCost: 6000, giftMaxItems: 2, boxCost: 3000 },
];

export const capsuleUnitPrice = (rung: Pick<CapsulePackRung, "packSize" | "total">) => rung.total / rung.packSize;

/** «Ahorras $X» frente a comprar el mismo número de cápsulas al precio del pack más pequeño. */
export function packSaving(rung: Pick<CapsulePackRung, "packSize" | "total">, ladder: readonly CapsulePackRung[] = CAPSULE_PACK_LADDER): number {
  const base = ladder[0];
  return Math.max(0, Math.round(capsuleUnitPrice(base) * rung.packSize - rung.total));
}

/** El pack más grande que se puede vender con los papeles que quedan: ninguno pasa del 25 %. `null` si ni el mínimo cabe. */
export function maxPackFor(remainingSlips: number, ladder: readonly CapsulePackRung[] = CAPSULE_PACK_LADDER): number | null {
  const allowed = ladder.filter((rung) => rung.packSize <= remainingSlips * CAPSULE_MAX_PACK_SHARE);
  return allowed.length ? allowed[allowed.length - 1].packSize : null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Costo provisional al pagar: la media de los papeles × el pack + el tope del regalo. Nunca 0. */
export function capsuleProvisionalCost({ averageSlipCost, packSize, giftMaxCost }: { averageSlipCost: number; packSize: number; giftMaxCost: number }): number {
  if (!(averageSlipCost > 0)) throw new Error("La edición no tiene papeles con costo: no hay costo provisional.");
  return round2(averageSlipCost * packSize + giftMaxCost);
}

const quantile = (sorted: readonly number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

/** Resumen de costo de una bolsa de papeles. */
export function slipCostBand(costs: readonly number[]) {
  if (costs.length === 0) return null;
  const sorted = [...costs].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round2(sorted.reduce((total, cost) => total + cost, 0) / sorted.length),
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

/** Generador con semilla (mulberry32): la misma semilla da el mismo resultado en las pruebas. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PackMarginInput {
  /** Costo de cada papel de la bolsa (uno por papel). */
  pool: readonly number[];
  rung: CapsulePackRung;
  runs?: number;
  seed?: number;
}

/**
 * Margen de un pack: (precio − papeles − regalo − caja − comisión) / precio,
 * con el regalo en su tope y la comisión de Bold en línea de la función
 * compartida. Esperado y P95 salen de sorteos sin reemplazo de la bolsa
 * completa; el peor caso son los n papeles más caros.
 */
export function packMargins({ pool, rung, runs = 20000, seed = 1 }: PackMarginInput) {
  if (pool.length < rung.packSize) throw new Error("La bolsa tiene menos papeles que el pack.");
  const fee = gatewayFee(rung.total, PaymentMethod.Bold) ?? 0;
  const fixed = rung.giftMaxCost + rung.boxCost + fee;
  const marginOf = (slipCost: number) => (rung.total - slipCost - fixed) / rung.total;

  const random = seededRandom(seed);
  const deck = [...pool];
  const margins: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    let cost = 0;
    for (let index = 0; index < rung.packSize; index += 1) {
      const pick = index + Math.floor(random() * (deck.length - index));
      [deck[index], deck[pick]] = [deck[pick], deck[index]];
      cost += deck[index];
    }
    margins.push(marginOf(cost));
  }
  margins.sort((a, b) => a - b);
  const worstCost = [...pool].sort((a, b) => b - a).slice(0, rung.packSize).reduce((total, cost) => total + cost, 0);
  return {
    fee,
    expected: margins.reduce((total, margin) => total + margin, 0) / margins.length,
    p95: quantile(margins, 0.05),
    worst: marginOf(worstCost),
  };
}
