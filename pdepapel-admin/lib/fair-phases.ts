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

export interface FairInventoryTotals {
  allocated: number;
  sold: number;
  returned: number;
  damaged: number;
  lost: number;
}

export function summarizeFairInventory(
  items: { allocatedQuantity: number; soldQuantity: number; returnedQuantity?: number; damagedQuantity?: number; lostQuantity?: number }[],
): FairInventoryTotals {
  return items.reduce<FairInventoryTotals>(
    (totals, item) => ({
      allocated: totals.allocated + item.allocatedQuantity,
      sold: totals.sold + item.soldQuantity,
      returned: totals.returned + (item.returnedQuantity ?? 0),
      damaged: totals.damaged + (item.damagedQuantity ?? 0),
      lost: totals.lost + (item.lostQuantity ?? 0),
    }),
    { allocated: 0, sold: 0, returned: 0, damaged: 0, lost: 0 },
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

export type ReconciliationRowStatus = "balanced" | "missing" | "over" | "sold-out";

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
  if (delta > 0) {
    return { expected, entered, delta, status: "missing", label: `Faltan ${delta}`, tone: "cream" };
  }
  return { expected, entered, delta, status: "over", label: `Sobran ${-delta}`, tone: "pink" };
}

export interface ReconciliationSummary {
  returned: number;
  damaged: number;
  lost: number;
  /** Filas que aún no cuadran. */
  unbalanced: number;
  balanced: boolean;
}

/** Totales de la conciliación tal como está escrita ahora mismo, y si ya cuadra completa. */
export function summarizeReconciliation(
  items: { productId: string; allocatedQuantity: number; soldQuantity: number }[],
  counts: Record<string, ReconciliationCount | undefined>,
): ReconciliationSummary {
  let returned = 0;
  let damaged = 0;
  let lost = 0;
  let unbalanced = 0;
  for (const item of items) {
    const count = counts[item.productId];
    const state = getReconciliationRowState(item, count);
    if (state.status === "missing" || state.status === "over") unbalanced += 1;
    returned += count?.returnedQuantity ?? 0;
    damaged += count?.damagedQuantity ?? 0;
    lost += count?.lostQuantity ?? 0;
  }
  return { returned, damaged, lost, unbalanced, balanced: unbalanced === 0 };
}
