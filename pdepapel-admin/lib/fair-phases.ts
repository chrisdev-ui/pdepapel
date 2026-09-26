import type { FairEventStatus } from "@prisma/client";

/**
 * Fases y vistas de Ferias (rediseño 2026-09).
 *
 * Una feria pasa por preparar (reservar stock y armar cápsulas), vender
 * (registrar cobros) y conciliar (contar lo no vendido); al cerrar queda
 * como historial. Las vistas de la lista agrupan por esas fases.
 */

export const FAIR_PHASES = [
  { id: "preparar", label: "Preparar", hint: "Reserva stock y arma cápsulas" },
  { id: "vender", label: "Vender", hint: "Registra cada cobro" },
  { id: "conciliar", label: "Conciliar", hint: "Cuenta lo no vendido" },
  { id: "cerrada", label: "Cerrada", hint: "Historial" },
] as const;

export type FairPhase = (typeof FAIR_PHASES)[number]["id"];

export function getFairPhase(status: FairEventStatus): FairPhase | null {
  switch (status) {
    case "DRAFT":
      return "preparar";
    case "OPEN":
      return "vender";
    case "RECONCILING":
      return "conciliar";
    case "CLOSED":
      return "cerrada";
    default:
      return null;
  }
}

export function getPhaseIndex(phase: FairPhase | null): number {
  return phase ? FAIR_PHASES.findIndex((item) => item.id === phase) : -1;
}

export const FAIR_STATUS_BADGE: Record<FairEventStatus, { label: string; tone: "lavender" | "mint" | "cream" | "slate" | "pink" }> = {
  DRAFT: { label: "En preparación", tone: "lavender" },
  OPEN: { label: "Abierta", tone: "mint" },
  RECONCILING: { label: "Conciliando", tone: "cream" },
  CLOSED: { label: "Cerrada", tone: "slate" },
  CANCELLED: { label: "Cancelada", tone: "pink" },
};

export const FAIR_VIEWS = [
  { id: "activas", label: "Activas" },
  { id: "cerradas", label: "Cerradas" },
  { id: "todas", label: "Todas" },
] as const;

export type FairView = (typeof FAIR_VIEWS)[number]["id"];
export const DEFAULT_FAIR_VIEW: FairView = "activas";

export function isFairView(value: string | null | undefined): value is FairView {
  return FAIR_VIEWS.some((view) => view.id === value);
}

/**
 * Los estados de cada vista, para filtrar en SQL en vez de traer todas las
 * ferias y descartarlas en el navegador. `todas` no acota nada.
 */
export function fairViewStatuses(view: FairView): FairEventStatus[] | null {
  switch (view) {
    case "activas":
      return ["DRAFT", "OPEN", "RECONCILING"];
    case "cerradas":
      return ["CLOSED", "CANCELLED"];
    default:
      return null;
  }
}

export function fairMatchesView(status: FairEventStatus, view: FairView): boolean {
  switch (view) {
    case "activas":
      return status === "DRAFT" || status === "OPEN" || status === "RECONCILING";
    case "cerradas":
      return status === "CLOSED" || status === "CANCELLED";
    case "todas":
      return true;
    default:
      return false;
  }
}

/**
 * Cuántas unidades físicas mueve una unidad de esta fila: 1 en un producto
 * suelto, la suma de piezas en un kit reservado como kit. Reservar, vender y
 * contar se hacen por fila (un kit es 1); el stock y el kardex se mueven por
 * pieza, y eso es lo que la administradora quiere leer cuando el cierre le
 * dice cuánto vuelve a bodega.
 */
export function fairRowUnitSize(item: {
  kitComponents?: { quantityPerKit: number }[] | null;
  [field: string]: unknown;
}): number {
  const lines = item.kitComponents ?? [];
  if (lines.length === 0) return 1;
  return lines.reduce((total, line) => total + line.quantityPerKit, 0);
}

export interface FairInventoryTotals {
  /** Unidades de fila (un kit cuenta 1). */
  allocated: number;
  sold: number;
  /** Unidades físicas que salieron del stock (las piezas de cada kit). */
  allocatedUnits: number;
  /** Unidades físicas: lo que entra o no entra al stock en línea. */
  returned: number;
  damaged: number;
  lost: number;
}

export function summarizeFairInventory(
  items: {
    allocatedQuantity: number;
    soldQuantity: number;
    returnedQuantity?: number;
    damagedQuantity?: number;
    lostQuantity?: number;
    kitComponents?: { quantityPerKit: number }[] | null;
  }[],
): FairInventoryTotals {
  return items.reduce<FairInventoryTotals>(
    (totals, item) => {
      const size = fairRowUnitSize(item);
      return {
        allocated: totals.allocated + item.allocatedQuantity,
        sold: totals.sold + item.soldQuantity,
        allocatedUnits: totals.allocatedUnits + item.allocatedQuantity * size,
        returned: totals.returned + (item.returnedQuantity ?? 0) * size,
        damaged: totals.damaged + (item.damagedQuantity ?? 0) * size,
        lost: totals.lost + (item.lostQuantity ?? 0) * size,
      };
    },
    { allocated: 0, sold: 0, allocatedUnits: 0, returned: 0, damaged: 0, lost: 0 },
  );
}

/** Porcentaje vendido sobre lo reservado, acotado a 0–100. */
export function soldShare(totals: Pick<FairInventoryTotals, "allocated" | "sold">): number {
  if (totals.allocated <= 0) return 0;
  return Math.min(100, Math.round((totals.sold / totals.allocated) * 100));
}

/** El siguiente paso que la administradora debe dar en la feria. */
export function getFairNextStep(input: { status: FairEventStatus; allocated: number; sold: number }): { label: string; anchor: string } | null {
  switch (input.status) {
    case "DRAFT":
      return input.allocated === 0
        ? { label: "Reservar el inventario que llevas", anchor: "#inventario" }
        : { label: "Revisar cápsulas y abrir para ventas", anchor: "#capsulas" };
    case "OPEN":
      return input.sold === 0
        ? { label: "Registrar la primera venta", anchor: "#ventas" }
        : { label: "Seguir vendiendo; al terminar, pasar a conciliación", anchor: "#cierre" };
    case "RECONCILING":
      return { label: "Contar lo no vendido y cerrar la feria", anchor: "#cierre" };
    default:
      return null;
  }
}

/** Estados en los que la feria acepta ventas y en los que aún se puede anular una venta. */
export function canSellInFair(status: FairEventStatus): boolean {
  return status === "OPEN";
}

export function canCancelFairSale(status: FairEventStatus): boolean {
  return status === "OPEN" || status === "RECONCILING";
}

export interface ReconciliationCount {
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
}

/**
 * `untouched` es «todavía no la he contado», distinto de «conté de menos»:
 * al abrir la conciliación todas las filas están así, y la diferencia es la
 * que evita que un formulario sin tocar parezca una cuenta hecha.
 */
export type ReconciliationRowStatus =
  | "balanced"
  | "untouched"
  | "missing"
  | "over"
  | "sold-out";

export interface ReconciliationRowState {
  /** Unidades que la feria espera ver contadas (reservado − vendido). */
  expected: number;
  entered: number;
  /** expected − entered: positivo faltan, negativo sobran. */
  delta: number;
  status: ReconciliationRowStatus;
  label: string;
  tone: "mint" | "cream" | "pink" | "slate";
}

/** Estado de una fila de conciliación: cuadra, faltan N, sobran N o no hay nada que contar. */
export function getReconciliationRowState(
  item: { allocatedQuantity: number; soldQuantity: number },
  count: ReconciliationCount | undefined,
): ReconciliationRowState {
  const expected = item.allocatedQuantity - item.soldQuantity;
  const entered = count ? count.returnedQuantity + count.damagedQuantity + count.lostQuantity : 0;
  const delta = expected - entered;
  if (expected === 0 && entered === 0) {
    return { expected, entered, delta, status: "sold-out", label: "Todo vendido", tone: "slate" };
  }
  if (delta === 0) {
    return { expected, entered, delta, status: "balanced", label: "Cuadra", tone: "mint" };
  }
  if (entered === 0) {
    return { expected, entered, delta, status: "untouched", label: "Sin contar", tone: "cream" };
  }
  if (delta > 0) {
    return { expected, entered, delta, status: "missing", label: `Faltan ${delta}`, tone: "cream" };
  }
  return { expected, entered, delta, status: "over", label: `Sobran ${-delta}`, tone: "pink" };
}

export interface ReconciliationSummary {
  /** Unidades físicas (las piezas de cada kit): lo que vuelve o no al stock en línea. */
  returned: number;
  damaged: number;
  lost: number;
  /** Filas que aún no cuadran. */
  unbalanced: number;
  /** Filas que nadie ha tocado todavía. */
  untouched: number;
  /** Unidades que faltan por repartir entre las tres columnas. */
  pending: number;
  balanced: boolean;
}

/** Totales de la conciliación tal como está escrita ahora mismo, y si ya cuadra completa. */
export function summarizeReconciliation(
  items: {
    productId: string;
    allocatedQuantity: number;
    soldQuantity: number;
    kitComponents?: { quantityPerKit: number }[] | null;
  }[],
  counts: Record<string, ReconciliationCount | undefined>,
): ReconciliationSummary {
  let returned = 0;
  let damaged = 0;
  let lost = 0;
  let unbalanced = 0;
  let untouched = 0;
  let pending = 0;
  for (const item of items) {
    const count = counts[item.productId];
    const state = getReconciliationRowState(item, count);
    if (state.status !== "balanced" && state.status !== "sold-out") unbalanced += 1;
    if (state.status === "untouched") untouched += 1;
    if (state.delta > 0) pending += state.delta;
    // Se cuenta por fila (un kit es 1), pero el stock se mueve por pieza.
    const size = fairRowUnitSize(item);
    returned += (count?.returnedQuantity ?? 0) * size;
    damaged += (count?.damagedQuantity ?? 0) * size;
    lost += (count?.lostQuantity ?? 0) * size;
  }
  return { returned, damaged, lost, unbalanced, untouched, pending, balanced: unbalanced === 0 };
}

/**
 * Unidades que todavía están en la mesa de la feria: lo reservado menos lo
 * vendido, lo empacado en cápsulas y lo ya conciliado.
 *
 * Vive aquí y no en `lib/fair-events.ts` porque el navegador también la
 * necesita y ese módulo arrastra Prisma. Antes estaba escrita dos veces,
 * idéntica, en el servidor y en el cliente.
 */
export interface FairStockCounts {
  allocatedQuantity: number;
  soldQuantity: number;
  packedQuantity: number;
  returnedQuantity: number;
  damagedQuantity: number;
  lostQuantity: number;
}

export const getFairStockAvailability = (item: FairStockCounts): number =>
  item.allocatedQuantity -
  item.soldQuantity -
  item.packedQuantity -
  item.returnedQuantity -
  item.damagedQuantity -
  item.lostQuantity;
