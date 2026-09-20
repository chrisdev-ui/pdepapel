import type { InventoryMovementType } from "@prisma/client";

import { ADJUSTMENT_TYPES, FAIR_LINKED_TYPES, RECEIPT_TYPES, SALE_TYPES } from "@/lib/kardex";

/**
 * Vistas de la lista de Movimientos y resumen de cabecera. Puro y testeable,
 * con la misma forma que `lib/inventory-views.ts`.
 *
 * El kardex de producción tiene más de 3.000 filas y la lista traía todo
 * mezclado: la pregunta real casi nunca es «qué pasó» sino «qué salió por
 * ventas», «qué entró del proveedor» o «qué ajusté a mano».
 */

export type MovementView = "todo" | "ventas" | "entradas" | "ajustes" | "ferias" | "pendientes";

export const MOVEMENT_VIEWS: { id: MovementView; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "ventas", label: "Ventas" },
  { id: "entradas", label: "Entradas" },
  { id: "ajustes", label: "Ajustes y pérdidas" },
  { id: "ferias", label: "Ferias" },
  { id: "pendientes", label: "Pendientes" },
];

export const DEFAULT_MOVEMENT_VIEW: MovementView = "todo";

export const isMovementView = (value: string | null | undefined): value is MovementView =>
  MOVEMENT_VIEWS.some((view) => view.id === value);

/**
 * «Pendientes» no son movimientos: son las líneas que no se pudieron mover
 * (`OrderInventoryIssue`). La pestaña cambia la tabla por ese panel, así que
 * ningún movimiento cae en esa vista.
 */
export const VIEW_WITHOUT_MOVEMENTS: MovementView = "pendientes";

/** Entradas: lo que suma unidades por reposición, devolución o carga inicial. */
export const ENTRY_TYPES: ReadonlySet<InventoryMovementType> = new Set<InventoryMovementType>([
  ...Array.from(RECEIPT_TYPES),
  "INITIAL_INTAKE",
  "INITIAL_MIGRATION",
  "RETURN",
  "ORDER_CANCELLED",
]);

export interface MovementRowInput {
  type: InventoryMovementType;
  quantity: number;
  createdAt: Date;
}

export function movementMatchesView(row: MovementRowInput, view: MovementView): boolean {
  switch (view) {
    case "todo":
      return true;
    case "ventas":
      return SALE_TYPES.has(row.type);
    case "entradas":
      return ENTRY_TYPES.has(row.type);
    case "ajustes":
      return ADJUSTMENT_TYPES.has(row.type);
    case "ferias":
      return FAIR_LINKED_TYPES.has(row.type);
    case "pendientes":
      return false;
  }
}

/** Días de la ventana que resumen las tarjetas de cabecera. */
export const MOVEMENT_SUMMARY_DAYS = 30;

export interface MovementTotals {
  /** Unidades que entraron en la ventana (positivo). */
  entries: number;
  /** Unidades que salieron en la ventana (positivo, ya en valor absoluto). */
  exits: number;
  /** Saldo neto de ajustes y pérdidas (puede ser negativo). */
  adjustments: number;
  /** Cuántos ajustes, daños y pérdidas hubo, para la nota de la tarjeta. */
  adjustmentCounts: { adjustments: number; damage: number; lost: number };
  /** Filas por vista, para los contadores de las pestañas. */
  byView: Record<MovementView, number>;
}

/**
 * Resume las filas ya cargadas. Las tarjetas miran solo los últimos
 * `MOVEMENT_SUMMARY_DAYS`; los contadores de las pestañas cuentan todo lo que
 * la lista tenga a la vista, igual que Productos y Pedidos.
 */
export function summarizeMovements(
  rows: MovementRowInput[],
  options: { now?: Date; days?: number; pending?: number } = {},
): MovementTotals {
  const now = options.now ?? new Date();
  const days = options.days ?? MOVEMENT_SUMMARY_DAYS;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const totals: MovementTotals = {
    entries: 0,
    exits: 0,
    adjustments: 0,
    adjustmentCounts: { adjustments: 0, damage: 0, lost: 0 },
    byView: { todo: 0, ventas: 0, entradas: 0, ajustes: 0, ferias: 0, pendientes: options.pending ?? 0 },
  };

  for (const row of rows) {
    for (const { id } of MOVEMENT_VIEWS) {
      if (id === VIEW_WITHOUT_MOVEMENTS) continue;
      if (movementMatchesView(row, id)) totals.byView[id] += 1;
    }

    if (row.createdAt < since) continue;
    if (row.quantity > 0) totals.entries += row.quantity;
    if (row.quantity < 0) totals.exits += Math.abs(row.quantity);
    if (ADJUSTMENT_TYPES.has(row.type)) {
      totals.adjustments += row.quantity;
      if (row.type === "DAMAGE") totals.adjustmentCounts.damage += 1;
      else if (row.type === "LOST") totals.adjustmentCounts.lost += 1;
      else totals.adjustmentCounts.adjustments += 1;
    }
  }

  return totals;
}

/** «18 ajustes · 3 daños · 1 pérdida», saltando lo que esté en cero. */
export function describeAdjustmentMix(counts: MovementTotals["adjustmentCounts"]): string {
  const parts: string[] = [];
  if (counts.adjustments > 0) parts.push(`${counts.adjustments} ${counts.adjustments === 1 ? "ajuste" : "ajustes"}`);
  if (counts.damage > 0) parts.push(`${counts.damage} ${counts.damage === 1 ? "daño" : "daños"}`);
  if (counts.lost > 0) parts.push(`${counts.lost} ${counts.lost === 1 ? "pérdida" : "pérdidas"}`);
  return parts.length > 0 ? parts.join(" · ") : "Sin ajustes en el periodo";
}
