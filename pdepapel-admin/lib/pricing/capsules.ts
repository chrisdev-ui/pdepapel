import { PaymentMethod } from "@prisma/client";

import { gatewayFee } from "@/lib/gateway-fees";

/**
 * Precio y margen de las cápsulas por papeles. Puro, sin base de datos: la
 * comisión sale de `lib/gateway-fees.ts` y ninguna cifra de pasarela vive aquí.
 */

/**
 * Bandera de lanzamiento, encendida el 2026-10-20 tras la revisión legal.
 * Encendida no vende nada por sí sola: una edición se vende solo cuando Paula
 * la pasa a LIVE en el taller, y el rollback rápido es pasarla a vista previa.
 */
export const CAPSULE_SALES_ENABLED = true;

/**
 * Lo que lee el código. Fuera de Vercel, las pruebas pueden forzarla con
 * `CAPSULE_SALES_TEST_OVERRIDE` ("1" encendida, "0" apagada); en cualquier
 * despliegue de Vercel (`VERCEL` definido) manda únicamente la constante.
 */
export function capsuleSalesEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (!env.VERCEL && env.CAPSULE_SALES_TEST_OVERRIDE === "0") return false;
  if (CAPSULE_SALES_ENABLED) return true;
  return !env.VERCEL && env.CAPSULE_SALES_TEST_OVERRIDE === "1";
}

/** Pack mínimo y la parte de los papeles que quedan que puede llevarse un solo pack. */
export const CAPSULE_MIN_PACK = 5;
export const CAPSULE_MAX_PACK_SHARE = 0.25;

/** El precio público de un pack. Es entero por cápsula para que `ProductPriceTier` lo represente exacto. */
export interface CapsulePackPrice {
  packSize: number;
  total: number;
}

/** Los precios aprobados (2026-10-20). Son públicos: la tienda los muestra. */
export const CAPSULE_PACK_PRICES: readonly CapsulePackPrice[] = [
  { packSize: 5, total: 64500 },
  { packSize: 10, total: 124900 },
  { packSize: 15, total: 179850 },
  { packSize: 20, total: 234900 },
  { packSize: 25, total: 289900 },
  { packSize: 30, total: 339900 },
];

/** Lo que cuesta un pack fuera de sus papeles. Vive en `CapsulePackOption` (cifras del negocio, por edición), nunca en el código. */
export interface CapsulePackCosts {
  packSize: number;
  giftMaxCost: number;
  giftMaxItems: number;
  boxReserveCost: number;
}

export type CapsulePackRung = CapsulePackPrice & CapsulePackCosts;

/** Cada precio con los costos de su pack. Un pack sin su configuración no se puede calcular. */
export function packRungs(options: readonly CapsulePackCosts[], prices: readonly CapsulePackPrice[] = CAPSULE_PACK_PRICES): CapsulePackRung[] {
  const bySize = new Map(options.map((option) => [option.packSize, option]));
  return [...prices]
    .sort((a, b) => a.packSize - b.packSize)
    .map((price) => {
      const costs = bySize.get(price.packSize);
      if (!costs) throw new Error(`Falta la configuración del pack de ${price.packSize} (regalo y caja).`);
      return { ...price, giftMaxCost: costs.giftMaxCost, giftMaxItems: costs.giftMaxItems, boxReserveCost: costs.boxReserveCost };
    });
}

/** El regalo más caro que puede llevar algún pack de la edición: el tope para imprimir su bolsa de regalos. */
export const maxGiftCostOf = (options: readonly Pick<CapsulePackCosts, "giftMaxCost">[]) => options.reduce((max, option) => Math.max(max, option.giftMaxCost), 0);

export const capsuleUnitPrice = (rung: Pick<CapsulePackPrice, "packSize" | "total">) => rung.total / rung.packSize;

/** «Ahorras $X» frente a comprar el mismo número de cápsulas al precio del pack más pequeño. */
export function packSaving(rung: CapsulePackPrice, prices: readonly CapsulePackPrice[] = CAPSULE_PACK_PRICES): number {
  const base = [...prices].sort((a, b) => a.packSize - b.packSize)[0];
  return Math.max(0, Math.round(capsuleUnitPrice(base) * rung.packSize - rung.total));
}

/** El pack más grande que se puede vender con los papeles que quedan: ninguno pasa del 25 %. `null` si ni el mínimo cabe. */
export function maxPackFor(remainingSlips: number, prices: readonly CapsulePackPrice[] = CAPSULE_PACK_PRICES): number | null {
  const allowed = prices.filter((price) => price.packSize <= remainingSlips * CAPSULE_MAX_PACK_SHARE).sort((a, b) => a.packSize - b.packSize);
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
  const fixed = rung.giftMaxCost + rung.boxReserveCost + fee;
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

export interface PackCheck {
  packSize: number;
  total: number;
  /** El pack cabe en la bolsa (≤ 25 % de los papeles). */
  available: boolean;
  expectedPct: number | null;
  p95Pct: number | null;
  worstPct: number | null;
  /** P95 ≥ el piso; null si no hay piso o el pack no cabe. */
  passes: boolean | null;
}

const pct = (value: number) => Math.round(value * 1000) / 10;

/**
 * El margen de cada pack sobre una bolsa (un costo por papel) contra un piso.
 * Lo usan el taller (`checkPoolMargins`) y las ediciones sugeridas: una sola
 * cuenta. Solo se miden los packs que caben (`maxPackFor`).
 */
export function evaluatePoolMargins({
  pool,
  options,
  minMarginPct,
  runs = 5000,
  seed = 1,
}: {
  pool: readonly number[];
  options: readonly CapsulePackCosts[];
  minMarginPct: number | null;
  runs?: number;
  seed?: number;
}): { poolSize: number; packs: PackCheck[]; ok: boolean } {
  const largest = maxPackFor(pool.length);
  const packs: PackCheck[] = packRungs(options).map((rung) => {
    if (largest === null || rung.packSize > largest) {
      return { packSize: rung.packSize, total: rung.total, available: false, expectedPct: null, p95Pct: null, worstPct: null, passes: null };
    }
    const result = packMargins({ pool, rung, runs, seed });
    const p95Pct = pct(result.p95);
    return {
      packSize: rung.packSize,
      total: rung.total,
      available: true,
      expectedPct: pct(result.expected),
      p95Pct,
      worstPct: pct(result.worst),
      passes: minMarginPct === null ? null : p95Pct >= minMarginPct,
    };
  });
  return { poolSize: pool.length, packs, ok: packs.every((pack) => pack.passes !== false) };
}
