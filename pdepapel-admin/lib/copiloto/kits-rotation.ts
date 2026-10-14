import { availableStock } from "@/lib/available-stock";
import { rankSlowMovers, type SalesHistory, type SlowMover } from "@/lib/sales-velocity";
import { EVERYDAY_USES, matchesOccasion, type Occasion } from "@/lib/season-calendar";

/**
 * Kits para rotar inventario, en código: el modelo solo los cuenta. Cada kit
 * junta uno o dos productos lentos con piezas que sí se venden y que tienen
 * relación con ellos (se compran juntos, mismo tipo o misma categoría). Las
 * señales (en alza, pedidos por WhatsApp, temporada) ordenan las piezas y
 * nombran la ocasión. El precio sale de los precios efectivos de las piezas:
 * nunca por encima de su suma y nunca por debajo del costo más el margen.
 */
export interface KitProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string | null;
  typeId: string | null;
  typeName: string | null;
  isKit: boolean;
  isArchived: boolean;
  stock: number;
  reservedUnits: number;
  createdAt: Date;
  unitCost: number | null;
  listPrice: number;
  effectivePrice: number;
  offerLabel: string | null;
}

export interface KitSignals {
  /** Productos en alza: unidades de los últimos 30 días contra los 30 anteriores. */
  rising: ReadonlyMap<string, { sold30: number; previous30: number }>;
  /** Veces que el bot enseñó el producto por WhatsApp (solo los que se repiten). */
  shownOnWhatsApp: ReadonlyMap<string, number>;
  /** Palabras que pidieron por WhatsApp, con sus cuentas (solo las que se repiten). */
  whatsAppTerms: readonly { termino: string; veces: number; sinResultados: number }[];
  occasions: readonly Occasion[];
}

export interface KitOptions {
  days: number;
  kits: number;
  minPerKit: number;
  minMarginPct: number;
}

export interface KitPiece {
  productId: string;
  nombre: string;
  rol: "lento" | "se vende";
  disponible: number;
  precioEfectivo: number;
  precioDeLista: number;
  oferta: string | null;
  costo: number | null;
}

export interface KitDraft {
  nombreSugerido: string;
  ocasion: string | null;
  piezas: KitPiece[];
  kitsArmables: number;
  sumaPreciosEfectivos: number;
  costoTotal: number | null;
  precioMinimo: number | null;
  precioSugerido: number | null;
  ahorroParaLaClienta: number | null;
  margenPct: number | null;
  sinCostoDe: string[];
  estado: "listo" | "sin costo" | "sin descuento posible" | "no da el margen";
  señales: string[];
}

export const RISING_MIN_UNITS = 3;
export const RISING_MIN_GROWTH = 1.5;
export const MAX_PIECES = 5;
export const MIN_PIECES = 3;

/** En alza: al menos 3 unidades en 30 días y 50 % más que los 30 anteriores (o empezó a venderse). */
export function risingProducts(products: readonly { id: string }[], history: SalesHistory) {
  const rising = new Map<string, { sold30: number; previous30: number }>();
  for (const product of products) {
    const { sold30, previous30 } = history.get(product.id);
    if (sold30 >= RISING_MIN_UNITS && sold30 >= previous30 * RISING_MIN_GROWTH && sold30 - previous30 >= 2) rising.set(product.id, { sold30, previous30 });
  }
  return rising;
}

/** Precio redondo justo por debajo de `sum` (de 1.000 en 1.000 desde 20.000; si no, de 500 en 500). */
export function roundBelow(sum: number): number {
  const step = sum >= 20000 ? 1000 : 500;
  return Math.max(0, Math.ceil(sum / step) * step - step);
}

const roundUp = (value: number, sum: number) => {
  const step = sum >= 20000 ? 1000 : 500;
  return Math.ceil(value / step) * step;
};

export function priceKit(pieces: readonly KitPiece[], minMarginPct: number) {
  const sum = Math.round(pieces.reduce((total, piece) => total + piece.precioEfectivo, 0));
  const sinCostoDe = pieces.filter((piece) => piece.costo === null).map((piece) => piece.nombre);
  const below = roundBelow(sum);
  if (sinCostoDe.length) {
    return { sum, cost: null, floor: null, price: below > 0 ? below : sum, margin: null, sinCostoDe, estado: "sin costo" as const };
  }
  const cost = Math.round(pieces.reduce((total, piece) => total + (piece.costo ?? 0), 0));
  const floor = Math.ceil(cost * (1 + minMarginPct / 100));
  let price: number | null;
  let estado: KitDraft["estado"];
  if (below >= floor && below > 0) {
    price = below;
    estado = "listo";
  } else if (floor <= sum) {
    price = Math.min(sum, roundUp(floor, sum));
    estado = price < sum ? "listo" : "sin descuento posible";
  } else {
    price = null;
    estado = "no da el margen";
  }
  const margin = price ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  return { sum, cost, floor, price, margin, sinCostoDe, estado };
}

const coKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Pedidos de los últimos 180 días con sus productos → cuántas veces aparece cada par en el mismo pedido. */
export function coPurchaseCounts(orders: readonly (readonly string[])[]) {
  const pairs = new Map<string, number>();
  for (const items of orders) {
    const unique = Array.from(new Set(items)).slice(0, 30);
    for (let i = 0; i < unique.length; i += 1) {
      for (let j = i + 1; j < unique.length; j += 1) pairs.set(coKey(unique[i], unique[j]), (pairs.get(coKey(unique[i], unique[j])) ?? 0) + 1);
    }
  }
  return { together: (a: string, b: string) => pairs.get(coKey(a, b)) ?? 0 };
}

const piece = (product: KitProduct, rol: KitPiece["rol"]): KitPiece => ({
  productId: product.id,
  nombre: product.name,
  rol,
  disponible: availableStock(product),
  precioEfectivo: Math.round(product.effectivePrice),
  precioDeLista: Math.round(product.listPrice),
  oferta: product.effectivePrice < product.listPrice ? (product.offerLabel ?? "precio rebajado") : null,
  costo: product.unitCost,
});

const textsOf = (product: KitProduct) => [product.name, product.categoryName, product.typeName];

function termsFor(product: KitProduct, terms: KitSignals["whatsAppTerms"]) {
  return terms.filter((term) => matchesOccasion(textsOf(product), [term.termino]));
}

export function proposeKits(input: {
  products: readonly KitProduct[];
  history: SalesHistory;
  together: (a: string, b: string) => number;
  signals: KitSignals;
  options: KitOptions;
}): { lentos: SlowMover[]; kits: KitDraft[]; sinKit: { nombre: string; motivo: string }[] } {
  const { products, history, together, signals, options } = input;
  const byId = new Map(products.map((product) => [product.id, product]));
  const lentos = rankSlowMovers(products.map((product) => ({ ...product })), history);
  const slowIds = new Set(lentos.map((row) => row.id));

  const sellers = products.filter(
    (product) => !product.isKit && !product.isArchived && !slowIds.has(product.id) && availableStock(product) >= options.minPerKit && history.get(product.id).soldInWindow > 0,
  );

  const kits: KitDraft[] = [];
  const sinKit: { nombre: string; motivo: string }[] = [];
  const usedSlow = new Set<string>();
  const usedPartner = new Map<string, number>();

  for (const slow of lentos) {
    if (kits.length >= options.kits) break;
    if (usedSlow.has(slow.id)) continue;
    const product = byId.get(slow.id)!;
    if (slow.available < options.minPerKit) {
      sinKit.push({ nombre: product.name, motivo: `solo hay ${slow.available} disponibles; no alcanza para ${options.minPerKit} kits` });
      continue;
    }
    const occasion = signals.occasions.find((candidate) => matchesOccasion(textsOf(product), candidate.palabras)) ?? null;

    const scored = sellers
      .map((partner) => {
        const pair = together(product.id, partner.id);
        const sameType = product.typeId !== null && product.typeId === partner.typeId;
        const sameCategory = product.categoryId === partner.categoryId;
        if (!pair && !sameType && !sameCategory) return null;
        const reasons: string[] = [];
        let score = Math.min(pair, 5) * 3 + (sameType ? 2 : 0) + (sameCategory ? 1 : 0);
        if (pair) reasons.push(`se compra junto con ${product.name} (${pair} ${pair === 1 ? "pedido" : "pedidos"} en 180 días)`);
        const up = signals.rising.get(partner.id);
        if (up) {
          score += 3;
          reasons.push(`en alza: ${up.sold30} unidades en 30 días contra ${up.previous30} antes`);
        }
        const shown = signals.shownOnWhatsApp.get(partner.id);
        if (shown) {
          score += Math.min(shown, 3);
          reasons.push(`el bot lo enseñó ${shown} veces por WhatsApp en 30 días`);
        }
        for (const term of termsFor(partner, signals.whatsAppTerms)) {
          score += 1;
          reasons.push(`«${term.termino}» se pidió ${term.veces} veces por WhatsApp en 30 días`);
        }
        if (occasion && matchesOccasion(textsOf(partner), occasion.palabras)) score += 2;
        score += Math.log1p(history.get(partner.id).soldInWindow) - (usedPartner.get(partner.id) ?? 0) * 2;
        return { partner, score, reasons };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.score - a.score || a.partner.name.localeCompare(b.partner.name));

    const secondSlow = lentos.find(
      (other) => other.id !== slow.id && !usedSlow.has(other.id) && other.available >= options.minPerKit && (byId.get(other.id)!.typeId === product.typeId || byId.get(other.id)!.categoryId === product.categoryId),
    );
    const partners = scored.slice(0, MAX_PIECES - 1 - (secondSlow ? 1 : 0));
    if (partners.length + 1 + (secondSlow ? 1 : 0) < MIN_PIECES) {
      sinKit.push({ nombre: product.name, motivo: "no hay piezas relacionadas que se vendan y tengan stock suficiente" });
      continue;
    }

    const pieces = [piece(product, "lento"), ...(secondSlow ? [piece(byId.get(secondSlow.id)!, "lento")] : []), ...partners.map((row) => piece(row.partner, "se vende"))];
    const pricing = priceKit(pieces, options.minMarginPct);
    const everyday = EVERYDAY_USES.find((use) => pieces.some((p) => matchesOccasion(textsOf(byId.get(p.productId)!), use.palabras)));
    const ocasion = occasion ? `${occasion.nombre} (en ${occasion.enDias} ${occasion.enDias === 1 ? "día" : "días"})` : (everyday?.nombre ?? null);

    const señales = [
      `${product.name}: ${slow.daysSinceLastSale === null ? "sin ventas en el último año" : `${slow.daysSinceLastSale} días sin venderse`}${slow.tiedUpAtCost !== null ? `, ${slow.tiedUpAtCost} pesos quietos a costo` : ""}`,
      ...(occasion ? [`temporada: ${occasion.nombre} el ${occasion.fecha}`] : []),
      ...partners.flatMap((row) => row.reasons.map((reason) => `${row.partner.name}: ${reason}`)),
      ...partners.filter((row) => !row.reasons.length).map((row) => `${row.partner.name}: misma ${row.partner.typeId === product.typeId ? "línea" : "categoría"} y se vende`),
    ];

    kits.push({
      nombreSugerido: `Kit ${ocasion ? ocasion.replace(/ \(en .*\)$/, "") : (product.categoryName ?? "surtido")} con ${product.name}`,
      ocasion,
      piezas: pieces,
      kitsArmables: Math.min(...pieces.map((p) => p.disponible)),
      sumaPreciosEfectivos: pricing.sum,
      costoTotal: pricing.cost,
      precioMinimo: pricing.floor,
      precioSugerido: pricing.price,
      ahorroParaLaClienta: pricing.price === null ? null : pricing.sum - pricing.price,
      margenPct: pricing.margin,
      sinCostoDe: pricing.sinCostoDe,
      estado: pricing.estado,
      señales,
    });
    usedSlow.add(slow.id);
    if (secondSlow) usedSlow.add(secondSlow.id);
    for (const row of partners) usedPartner.set(row.partner.id, (usedPartner.get(row.partner.id) ?? 0) + 1);
  }

  return { lentos, kits, sinKit };
}
