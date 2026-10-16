import { roundDown900, roundUp900 } from "./rounding";

/** Puntos de descuento extra por cada tamaño más grande (decisión D5, 2026-10-16). */
export const DEFAULT_PACK_STEP_PCT = 5;
/** Con menos packs que esto de un tamaño, se recomiendan como mucho dos tamaños empezando por el más pequeño. */
export const FEW_PACKS = 8;

export interface PackPriceInput {
  sizes: readonly number[];
  /** Los precios que dio Paula, por tamaño; al menos uno. */
  given: Readonly<Record<number, number>>;
  stepPct?: number;
}

export interface PackPrice {
  size: number;
  price: number;
  fromLadder: boolean;
}

/**
 * Precio de cada tamaño. Los que Paula dio se respetan; los demás salen del
 * tamaño dado más pequeño, escalado por unidades, con `stepPct` puntos más de
 * descuento por cada tamaño de diferencia, bajado al precio terminado en 900
 * (los tamaños más pequeños que el dado pagan menos descuento y suben a …900).
 */
export function packLadder({ sizes, given, stepPct = DEFAULT_PACK_STEP_PCT }: PackPriceInput): PackPrice[] {
  const sorted = Array.from(new Set(sizes)).sort((a, b) => a - b);
  const baseIndex = sorted.findIndex((size) => typeof given[size] === "number" && given[size] > 0);
  if (baseIndex < 0) throw new Error("Hace falta el precio de al menos un tamaño.");
  const baseSize = sorted[baseIndex];
  const baseUnit = given[baseSize] / baseSize;
  return sorted.map((size, index) => {
    if (typeof given[size] === "number" && given[size] > 0) return { size, price: given[size], fromLadder: false };
    const factor = 1 - (stepPct / 100) * (index - baseIndex);
    // Hacia abajo el redondeo sube: bajarlo dejaba la unidad del pack chico más barata que la del grande.
    const price = index > baseIndex ? roundDown900(baseUnit * size * factor) : roundUp900(baseUnit * size * factor);
    return { size, price, fromLadder: true };
  });
}

export interface PackScenario {
  size: number;
  price: number;
  fromLadder: boolean;
  unitPrice: number;
  /** Cuánto menos cuesta cada unidad frente al tamaño más pequeño, en %; null en el más pequeño. */
  unitDiscountPct: number | null;
  packCost: number;
  profit: number;
  profitPct: number;
  packs: number;
  leftover: number;
  totalProfit: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function packScenarios({
  prices,
  unitCost,
  packaging,
  available,
}: {
  prices: readonly PackPrice[];
  unitCost: number;
  /** Costo del empaque de cada pack; null si no se dio (no se descuenta). */
  packaging: number | null;
  available: number;
}): PackScenario[] {
  const smallest = prices[0];
  return prices.map(({ size, price, fromLadder }) => {
    const packCost = size * unitCost + (packaging ?? 0);
    const profit = price - packCost;
    const unitPrice = price / size;
    const packs = Math.floor(available / size);
    return {
      size,
      price,
      fromLadder,
      unitPrice: Math.round(unitPrice),
      unitDiscountPct: size === smallest.size ? null : round1((1 - unitPrice / (smallest.price / smallest.size)) * 100),
      packCost: Math.round(packCost),
      profit: Math.round(profit),
      profitPct: price > 0 ? round1((profit / price) * 100) : 0,
      packs,
      leftover: available - packs * size,
      totalProfit: Math.round(packs * profit),
    };
  });
}

/** Regla fija: con pocos packs de algún tamaño, los dos más pequeños; si no, los dos que más ganan en total. */
export function recommendSizes(scenarios: readonly PackScenario[]): number[] {
  if (scenarios.some((scenario) => scenario.packs < FEW_PACKS)) return scenarios.slice(0, 2).map((scenario) => scenario.size);
  return [...scenarios]
    .sort((a, b) => b.totalProfit - a.totalProfit || a.size - b.size)
    .slice(0, 2)
    .map((scenario) => scenario.size)
    .sort((a, b) => a - b);
}

export interface PackMix {
  kind: "mayor-ganancia" | "mitad-y-mitad" | "menos-packs";
  counts: { size: number; packs: number }[];
  leftover: number;
  totalProfit: number;
}

/**
 * Hasta tres mezclas de los tamaños recomendados que dejan el menor sobrante
 * posible: la que más gana, la que reparte las unidades más parejo y la de
 * menos packs. Las repetidas se quitan.
 */
export function packMixes(scenarios: readonly PackScenario[], recommended: readonly number[], available: number): PackMix[] {
  const [first, second] = recommended.map((size) => scenarios.find((scenario) => scenario.size === size)!);
  if (!first) return [];
  const options: { a: number; b: number; leftover: number; total: number }[] = [];
  for (let a = 0; a * first.size <= available; a += 1) {
    const b = second ? Math.floor((available - a * first.size) / second.size) : 0;
    const leftover = available - a * first.size - b * (second?.size ?? 0);
    options.push({ a, b, leftover, total: a * first.profit + b * (second?.profit ?? 0) });
  }
  const least = Math.min(...options.map((option) => option.leftover));
  const candidates = options.filter((option) => option.leftover === least && option.a + option.b > 0);
  if (candidates.length === 0) return [];
  const pick = (compare: (x: (typeof candidates)[number], y: (typeof candidates)[number]) => number) => [...candidates].sort(compare)[0];
  const chosen: [PackMix["kind"], (typeof candidates)[number]][] = [["mayor-ganancia", pick((x, y) => y.total - x.total || x.a + x.b - (y.a + y.b))]];
  if (second) {
    const units = (option: (typeof candidates)[number]) => Math.abs(option.a * first.size - option.b * second.size);
    chosen.push(["mitad-y-mitad", pick((x, y) => units(x) - units(y) || y.total - x.total)]);
  }
  chosen.push(["menos-packs", pick((x, y) => x.a + x.b - (y.a + y.b) || y.total - x.total)]);
  const seen = new Set<string>();
  const mixes: PackMix[] = [];
  for (const [kind, option] of chosen) {
    const key = `${option.a}-${option.b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mixes.push({
      kind,
      counts: [
        { size: first.size, packs: option.a },
        ...(second ? [{ size: second.size, packs: option.b }] : []),
      ].filter((count) => count.packs > 0),
      leftover: option.leftover,
      totalProfit: Math.round(option.total),
    });
  }
  return mixes;
}
