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
        : { label: "Seguir vendiendo o conciliar al terminar", anchor: "#ventas" };
    case "RECONCILING":
      return { label: "Terminar la conciliación", anchor: "#cierre" };
    default:
      return null;
  }
}
