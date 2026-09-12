/**
 * Reposición por cobertura: qué se acaba primero según lo que se vende, no
 * solo cuántas unidades quedan. Puro y testeable; la carga de datos vive en
 * el loader de Inventario.
 */

export const SALES_WINDOW_DAYS = 30;
export const DORMANT_WINDOW_DAYS = 90;
/** Días de cobertura por debajo de los cuales un producto con ventas entra en «Por reponer». */
export const REPLENISH_COVER_DAYS = 14;
/** Semanas de venta que un pedido de reposición debería cubrir. */
export const TARGET_WEEKS = 4;

export interface ReplenishmentInput {
  stock: number;
  /** Unidades vendidas en la ventana de ventas (30 días), netas de cancelaciones. */
  sold30: number;
  /** Unidades vendidas en los últimos 90 días. */
  sold90: number;
  /** Unidades pedidas a proveedores y todavía no recibidas. */
  onOrder?: number;
  /** Umbral de stock crítico de la tienda (respaldo cuando no hay ventas suficientes). */
  threshold?: number;
}

export interface ReplenishmentSignal {
  /** Unidades por semana en la ventana que aplica (30 días, o 90 si no vendió en 30). */
  weeklyRate: number;
  /** Ventana de la que sale el ritmo; null sin ventas en 90 días. */
  rateWindowDays: 30 | 90 | null;
  /** Días de cobertura con el stock actual; null sin ventas en 90 días. */
  coverDays: number | null;
  /** Días de cobertura contando lo que viene en camino. */
  coverDaysWithOnOrder: number | null;
  /** Cantidad sugerida a pedir (4 semanas de venta menos stock y lo en camino), 0 si nada. */
  suggested: number;
  /** Sin ventas en 90 días y con stock: candidato a oferta, no a reposición. */
  dormant: boolean;
  /** Agotado pero con ventas en 90 días: se estaban perdiendo ventas. */
  outOfStockSelling: boolean;
  /** Entra en la vista «Por reponer». */
  needsReplenishment: boolean;
  /** Todavía hay stock, se vende y se acaba en menos de una semana. Lo ya agotado va en `outOfStockSelling`. */
  runsOutThisWeek: boolean;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function computeReplenishment({ stock, sold30, sold90, onOrder = 0, threshold = 0 }: ReplenishmentInput): ReplenishmentSignal {
  const safeStock = Math.max(0, stock);
  // Ritmo de venta: los últimos 30 días; si en ese tramo no vendió pero sí en
  // 90 (estacional o agotado hace semanas), el ritmo de 90 días manda. Un
  // producto que vendió en 90 días «se vende» para todas las reglas: la
  // cobertura, el umbral y el sugerido salen del mismo ritmo.
  const rateWindowDays: 30 | 90 | null = sold30 > 0 ? 30 : sold90 > 0 ? 90 : null;
  const perDay = sold30 > 0 ? sold30 / SALES_WINDOW_DAYS : sold90 > 0 ? sold90 / DORMANT_WINDOW_DAYS : 0;
  const weeklyRate = round1(perDay * 7);
  const coverDays = perDay > 0 ? Math.floor(safeStock / perDay) : null;
  const coverDaysWithOnOrder = perDay > 0 ? Math.floor((safeStock + Math.max(0, onOrder)) / perDay) : null;
  const target = perDay * 7 * TARGET_WEEKS;
  const suggested = perDay > 0 ? Math.max(0, Math.ceil(target - safeStock - Math.max(0, onOrder))) : 0;
  const dormant = sold90 <= 0 && safeStock > 0;
  const outOfStockSelling = safeStock <= 0 && sold90 > 0;
  const selling = perDay > 0;
  // El umbral de unidades es un respaldo para lo que se vende ahora mismo:
  // un producto que vendió una unidad en el trimestre y tiene tres no es una
  // compra de esta semana, aunque esté bajo el umbral. Su cobertura ya lo
  // trae a la vista cuando de verdad se acerca a agotarse.
  const needsReplenishment =
    outOfStockSelling ||
    (selling && coverDays !== null && coverDays <= REPLENISH_COVER_DAYS) ||
    (sold30 > 0 && threshold > 0 && safeStock <= threshold);
  const runsOutThisWeek = selling && safeStock > 0 && coverDays !== null && coverDays < 7;
  return { weeklyRate, rateWindowDays, coverDays, coverDaysWithOnOrder, suggested, dormant, outOfStockSelling, needsReplenishment, runsOutThisWeek };
}

/** Orden de urgencia: agotados con ventas primero, luego por cobertura ascendente, luego por stock. */
export function compareUrgency<T extends { stock: number; signal: ReplenishmentSignal }>(a: T, b: T): number {
  const rank = (row: T) => {
    if (row.signal.outOfStockSelling) return 0;
    if (row.signal.coverDays !== null) return 1;
    if (row.stock <= 0) return 2;
    return 3;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 1) return (a.signal.coverDays ?? 0) - (b.signal.coverDays ?? 0) || b.signal.weeklyRate - a.signal.weeklyRate;
  return a.stock - b.stock;
}

export type CoverTone = "pink" | "cream" | "mint" | "slate";

/** Texto y tono de la celda de cobertura. */
export function describeCover(signal: ReplenishmentSignal, options: { lostOrders?: number; limitingComponent?: string | null } = {}): { label: string; tone: CoverTone; percent: number } {
  if (signal.outOfStockSelling) {
    const lost = options.lostOrders ? ` · ${options.lostOrders} ${options.lostOrders === 1 ? "pedido perdido" : "pedidos perdidos"}` : "";
    return { label: `Agotado${lost}`, tone: "pink", percent: 0 };
  }
  if (signal.coverDays === null) {
    return { label: signal.dormant ? `Sin ventas en ${DORMANT_WINDOW_DAYS} días` : "Sin ventas recientes", tone: "slate", percent: 100 };
  }
  const limit = options.limitingComponent ? ` · limita ${options.limitingComponent}` : "";
  const window = signal.rateWindowDays === 90 ? ` · ritmo de ${DORMANT_WINDOW_DAYS} días` : "";
  const label = `${signal.coverDays} ${signal.coverDays === 1 ? "día" : "días"}${limit}${window}`;
  const percent = Math.max(4, Math.min(100, Math.round((signal.coverDays / (REPLENISH_COVER_DAYS * 2)) * 100)));
  if (signal.coverDays < 7) return { label, tone: "pink", percent };
  if (signal.coverDays <= REPLENISH_COVER_DAYS) return { label, tone: "cream", percent };
  return { label, tone: "mint", percent };
}

/** «3,3 por semana · 10 días de cobertura» (o «Sin ventas en 90 días»), igual en Inventario y en el kardex. */
export function describeRate(signal: Pick<ReplenishmentSignal, "weeklyRate" | "coverDays" | "rateWindowDays">): string {
  if (signal.coverDays === null) return `Sin ventas en ${DORMANT_WINDOW_DAYS} días`;
  const window = signal.rateWindowDays === 90 ? ` (ritmo de ${DORMANT_WINDOW_DAYS} días)` : "";
  return `${signal.weeklyRate.toLocaleString("es-CO", { maximumFractionDigits: 1 })} por semana${window} · ${signal.coverDays.toLocaleString("es-CO")} ${signal.coverDays === 1 ? "día" : "días"} de cobertura`;
}

/** Componente que limita un kit: el que menos kits permite armar. */
export function limitingKitComponent(components: { name: string; quantity: number; stock: number }[]): { name: string; kits: number } | null {
  if (components.length === 0) return null;
  let worst: { name: string; kits: number } | null = null;
  for (const component of components) {
    const kits = component.quantity > 0 ? Math.floor(Math.max(0, component.stock) / component.quantity) : 0;
    if (!worst || kits < worst.kits) worst = { name: component.name, kits };
  }
  return worst;
}

/**
 * Demanda real de cada producto: sus ventas directas más las que salieron
 * dentro de kits (cada kit vendido consume `quantity` unidades del componente).
 * Devuelve un mapa nuevo; el de entrada no se toca.
 */
export function addKitDemand(
  sold: ReadonlyMap<string, number>,
  kits: { id: string; components: { componentId: string; quantity: number }[] }[],
): { total: Map<string, number>; viaKits: Map<string, number> } {
  const total = new Map(sold);
  const viaKits = new Map<string, number>();
  for (const kit of kits) {
    const kitSold = sold.get(kit.id) ?? 0;
    if (kitSold <= 0) continue;
    for (const component of kit.components) {
      const units = kitSold * Math.max(0, component.quantity);
      if (units <= 0) continue;
      total.set(component.componentId, (total.get(component.componentId) ?? 0) + units);
      viaKits.set(component.componentId, (viaKits.get(component.componentId) ?? 0) + units);
    }
  }
  return { total, viaKits };
}
