import { availableStock } from "@/lib/available-stock";
import { newWithoutSalesData, rankSlowMovers, type SalesHistory, type SlowMover } from "@/lib/sales-velocity";
import { EVERYDAY_USES, foldWords, matchesOccasion, type Occasion } from "@/lib/season-calendar";

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
  /** Primera entrada de inventario, o creación si no hay. */
  stockedSince: Date;
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
  /** Descuento objetivo sobre la suma de precios efectivos, en % (8 a 20). */
  targetDiscountPct: number;
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
  /** Ahorro real sobre la suma de precios efectivos, en %. */
  ahorroPct: number | null;
  descuentoObjetivoPct: number;
  margenPct: number | null;
  sinCostoDe: string[];
  estado: KitPricing["estado"];
  señales: string[];
}

/** Kit que no conviene ofrecer: el descuento real queda por debajo del 5 % o no da el margen. */
export interface WeakKit {
  nombre: string;
  piezas: string[];
  ahorroPct: number | null;
  motivo: string;
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

export const DEFAULT_TARGET_DISCOUNT_PCT = 12;
export const MIN_TARGET_DISCOUNT_PCT = 8;
export const MAX_TARGET_DISCOUNT_PCT = 20;
/** Por debajo de esto el kit no le dice nada a la clienta. */
export const MIN_ATTRACTIVE_DISCOUNT_PCT = 5;

/** El precio terminado en 900 más alto que no pasa de `value` (117.656 → 116.900). */
export function roundDown900(value: number): number {
  if (value < 900) return 0;
  return Math.floor((value - 900) / 1000) * 1000 + 900;
}

/** El precio terminado en 900 más bajo que no baja de `value`. */
export function roundUp900(value: number): number {
  return Math.max(900, Math.ceil((value - 900) / 1000) * 1000 + 900);
}

export interface KitPricing {
  sum: number;
  cost: number | null;
  floor: number | null;
  price: number | null;
  margin: number | null;
  ahorro: number | null;
  ahorroPct: number | null;
  sinCostoDe: string[];
  estado: "listo" | "descuento limitado por costo" | "sin costo" | "poco atractivo" | "no da el margen";
}

/**
 * Suma de precios efectivos × (1 − descuento objetivo), hacia abajo a un
 * precio terminado en 900. Nunca por debajo de costo + margen mínimo: si el
 * piso gana, se usa el piso (subido al 900 siguiente) y el descuento queda
 * limitado por el costo. Nunca por encima de la suma de las piezas.
 */
export function priceKit(pieces: readonly KitPiece[], minMarginPct: number, targetDiscountPct = DEFAULT_TARGET_DISCOUNT_PCT): KitPricing {
  const sum = Math.round(pieces.reduce((total, piece) => total + piece.precioEfectivo, 0));
  const sinCostoDe = pieces.filter((piece) => piece.costo === null).map((piece) => piece.nombre);
  const target = roundDown900(sum * (1 - targetDiscountPct / 100));
  const withSavings = (price: number | null) => {
    if (price === null) return { ahorro: null, ahorroPct: null };
    const ahorro = sum - price;
    return { ahorro, ahorroPct: Math.round((ahorro / sum) * 1000) / 10 };
  };
  if (sinCostoDe.length) {
    const price = target > 0 ? target : null;
    const savings = withSavings(price);
    return { sum, cost: null, floor: null, price, margin: null, ...savings, sinCostoDe, estado: savings.ahorroPct !== null && savings.ahorroPct < MIN_ATTRACTIVE_DISCOUNT_PCT ? "poco atractivo" : "sin costo" };
  }
  const cost = Math.round(pieces.reduce((total, piece) => total + (piece.costo ?? 0), 0));
  const floor = Math.ceil(cost * (1 + minMarginPct / 100));
  let price: number | null = null;
  let estado: KitPricing["estado"];
  if (target > 0 && target >= floor) {
    price = target;
    estado = "listo";
  } else if (roundUp900(floor) <= sum) {
    price = roundUp900(floor);
    estado = "descuento limitado por costo";
  } else {
    estado = "no da el margen";
  }
  const savings = withSavings(price);
  if (price !== null && (savings.ahorroPct ?? 0) < MIN_ATTRACTIVE_DISCOUNT_PCT) estado = "poco atractivo";
  const margin = price ? Math.round(((price - cost) / price) * 1000) / 10 : null;
  return { sum, cost, floor, price, margin, ...savings, sinCostoDe, estado };
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

/** Las mismas compras por línea de producto (Type): dos líneas que salen juntas se complementan. */
export function typeCoPurchaseCounts(orders: readonly (readonly string[])[], typeOf: (productId: string) => string | null) {
  return coPurchaseCounts(orders.map((items) => Array.from(new Set(items.map(typeOf).filter((type): type is string => Boolean(type))))));
}

/** Palabras que no dicen qué es el producto («Set de…», «Kit…»). */
const GENERIC_NOUNS = new Set(["set", "kit", "pack", "paquete", "combo", "mini", "super", "nuevo", "nueva"]);

/** Lo que el producto es: su línea (Type) y el primer sustantivo del nombre («cuaderno», «marcadores»). */
export function kindOf(product: { name: string; typeId: string | null }) {
  const words = foldWords(product.name).replace(/[^a-z ]+/g, " ").split(/\s+/).filter((word) => word.length >= 4 && !GENERIC_NOUNS.has(word));
  const noun = words[0] ?? null;
  return { typeId: product.typeId, noun: noun ? noun.replace(/(es|s)$/, "") : null };
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
  /** Veces que dos líneas (Type) salen en el mismo pedido en 180 días. */
  typesTogether?: (a: string, b: string) => number;
  signals: KitSignals;
  options: KitOptions;
}): { lentos: SlowMover[]; nuevos: { nombre: string; enInventarioDesde: Date }[]; kits: KitDraft[]; pocoAtractivos: WeakKit[]; sinKit: { nombre: string; motivo: string }[] } {
  const { products, history, together, signals, options } = input;
  const typesTogether = input.typesTogether ?? (() => 0);
  const byId = new Map(products.map((product) => [product.id, product]));
  const lentos = rankSlowMovers(products.map((product) => ({ ...product })), history);
  const slowIds = new Set(lentos.map((row) => row.id));
  const nuevos = newWithoutSalesData(products, history).map((product) => ({ nombre: product.name, enInventarioDesde: product.stockedSince }));

  const sellers = products.filter(
    (product) => !product.isKit && !product.isArchived && !slowIds.has(product.id) && availableStock(product) >= options.minPerKit && history.get(product.id).soldInWindow > 0,
  );

  /** Se complementan: se compraron juntos, o sus líneas salen juntas en los pedidos. Nunca la misma línea ni el mismo producto con otro nombre. */
  const complements = (a: KitProduct, b: KitProduct) => {
    const pair = together(a.id, b.id);
    const lines = a.typeId && b.typeId && a.typeId !== b.typeId ? typesTogether(a.typeId, b.typeId) : 0;
    return { pair, lines, related: pair > 0 || lines >= 2 };
  };
  const clashes = (chosen: readonly KitProduct[], candidate: KitProduct) => {
    const kind = kindOf(candidate);
    return chosen.some((other) => {
      const otherKind = kindOf(other);
      return (kind.typeId !== null && kind.typeId === otherKind.typeId) || (kind.noun !== null && kind.noun === otherKind.noun);
    });
  };

  const kits: KitDraft[] = [];
  const pocoAtractivos: WeakKit[] = [];
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
        const relation = complements(product, partner);
        if (!relation.related) return null;
        const reasons: string[] = [];
        let score = Math.min(relation.pair, 5) * 3 + Math.min(relation.lines, 5);
        if (relation.pair) reasons.push(`se compra junto con ${product.name} (${relation.pair} ${relation.pair === 1 ? "pedido" : "pedidos"} en 180 días)`);
        else reasons.push(`su línea se compra junto con la de ${product.name} (${relation.lines} pedidos en 180 días)`);
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

    const chosen: KitProduct[] = [product];
    const secondSlowRow = lentos.find((other) => {
      if (other.id === slow.id || usedSlow.has(other.id) || other.available < options.minPerKit) return false;
      const candidate = byId.get(other.id)!;
      return !clashes(chosen, candidate) && complements(product, candidate).related;
    });
    if (secondSlowRow) chosen.push(byId.get(secondSlowRow.id)!);
    const partners: typeof scored = [];
    for (const row of scored) {
      if (chosen.length >= MAX_PIECES) break;
      if (clashes(chosen, row.partner)) continue;
      chosen.push(row.partner);
      partners.push(row);
    }
    if (chosen.length < MIN_PIECES) {
      sinKit.push({ nombre: product.name, motivo: "no hay piezas de otras líneas que se compren con él, se vendan y tengan stock suficiente" });
      continue;
    }

    const pieces = [piece(product, "lento"), ...(secondSlowRow ? [piece(byId.get(secondSlowRow.id)!, "lento")] : []), ...partners.map((row) => piece(row.partner, "se vende"))];
    const pricing = priceKit(pieces, options.minMarginPct, options.targetDiscountPct);
    const everyday = EVERYDAY_USES.find((use) => pieces.some((p) => matchesOccasion(textsOf(byId.get(p.productId)!), use.palabras)));
    const ocasion = occasion ? `${occasion.nombre} (en ${occasion.enDias} ${occasion.enDias === 1 ? "día" : "días"})` : (everyday?.nombre ?? null);
    const nombreSugerido = `Kit ${ocasion ? ocasion.replace(/ \(en .*\)$/, "") : (product.typeName ?? product.categoryName ?? "surtido")} con ${product.name}`;

    if (pricing.estado === "poco atractivo" || pricing.estado === "no da el margen") {
      pocoAtractivos.push({
        nombre: nombreSugerido,
        piezas: pieces.map((p) => p.nombre),
        ahorroPct: pricing.ahorroPct,
        motivo:
          pricing.estado === "no da el margen"
            ? "con el margen mínimo costaría más que las piezas sueltas"
            : `el ahorro real sería de solo ${pricing.ahorroPct} % (el costo no deja bajar más)`,
      });
      continue;
    }

    const señales = [
      `${product.name}: ${slow.daysSinceLastSale === null ? "sin ventas en el último año" : `${slow.daysSinceLastSale} días sin venderse`}${slow.tiedUpAtCost !== null ? `, ${pesos(slow.tiedUpAtCost)} quietos a costo` : ""}`,
      ...(occasion ? [`temporada: ${occasion.nombre} el ${occasion.fecha}`] : []),
      ...partners.flatMap((row) => row.reasons.map((reason) => `${row.partner.name}: ${reason}`)),
    ];

    kits.push({
      nombreSugerido,
      ocasion,
      piezas: pieces,
      kitsArmables: Math.min(...pieces.map((p) => p.disponible)),
      sumaPreciosEfectivos: pricing.sum,
      costoTotal: pricing.cost,
      precioMinimo: pricing.floor,
      precioSugerido: pricing.price,
      ahorroParaLaClienta: pricing.ahorro,
      ahorroPct: pricing.ahorroPct,
      descuentoObjetivoPct: options.targetDiscountPct,
      margenPct: pricing.margin,
      sinCostoDe: pricing.sinCostoDe,
      estado: pricing.estado,
      señales,
    });
    usedSlow.add(slow.id);
    if (secondSlowRow) usedSlow.add(secondSlowRow.id);
    for (const row of partners) usedPartner.set(row.partner.id, (usedPartner.get(row.partner.id) ?? 0) + 1);
  }

  return { lentos, nuevos, kits, pocoAtractivos, sinKit };
}

export const pesos = (value: number) => `$${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const percent = (value: number) => `${String(value).replace(".", ",")} %`;

/**
 * El detalle fijo de un borrador (piezas con su precio, cuentas y señales),
 * para copiarlo tal cual: con cinco piezas el modelo tiende a resumir y se
 * pierden los precios por pieza y las cuentas de WhatsApp.
 */
export function kitDetail(kit: KitDraft): string {
  const pieces = kit.piezas.map(
    (piece) => `- ${piece.nombre} (${piece.rol}): ${pesos(piece.precioEfectivo)}${piece.oferta ? ` con la oferta «${piece.oferta}» (antes ${pesos(piece.precioDeLista)})` : ""}`,
  );
  const numbers = [
    `Se pueden armar ${kit.kitsArmables}`,
    `suma de precios efectivos ${pesos(kit.sumaPreciosEfectivos)}`,
    ...(kit.precioSugerido !== null ? [`precio sugerido ${pesos(kit.precioSugerido)}`] : []),
    ...(kit.margenPct !== null ? [`margen ${percent(kit.margenPct)}`] : []),
    ...(kit.ahorroParaLaClienta !== null && kit.ahorroPct !== null ? [`ahorro ${pesos(kit.ahorroParaLaClienta)} (${percent(kit.ahorroPct)})`] : []),
  ];
  const notes = [
    ...(kit.sinCostoDe.length ? [`Sin costo de ${kit.sinCostoDe.join(", ")}: no se calcula margen ni precio mínimo.`] : []),
    ...(kit.estado === "descuento limitado por costo" ? [`El descuento quedó por debajo del ${kit.descuentoObjetivoPct} % porque el costo no deja bajar más.`] : []),
  ];
  return [...pieces, `${numbers.join(" · ")}.`, ...notes, `Por qué: ${kit.señales.join("; ")}.`].join("\n");
}
