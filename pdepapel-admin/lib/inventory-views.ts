import { DEFAULT_LOW_STOCK_THRESHOLD, isLowStock, isOutOfStock } from "@/lib/product-readiness";
import type { ReplenishmentSignal } from "@/lib/replenishment";

/**
 * Vistas de la lista de Inventario y valorización por fila. Puro y testeable.
 *
 * El umbral de "stock crítico" llega resuelto desde `resolveLowStockThreshold`
 * (tienda o valor por defecto); el valor por defecto aquí solo cubre a quien
 * no lo pase.
 */

export type InventoryView = "todo" | "por-reponer" | "agotados" | "sin-costo" | "kits";

export const INVENTORY_VIEWS: { id: InventoryView; label: string }[] = [
  { id: "por-reponer", label: "Por reponer" },
  { id: "agotados", label: "Agotados" },
  { id: "sin-costo", label: "Sin costo" },
  { id: "kits", label: "Kits" },
  { id: "todo", label: "Todo" },
];

export const isInventoryView = (value: string | null | undefined): value is InventoryView => INVENTORY_VIEWS.some((v) => v.id === value);

/** Acepta el id antiguo «stock-critico» (enlaces guardados) y lo lleva a «por-reponer». */
export function normalizeInventoryView(value: string | null | undefined): InventoryView | null {
  if (value === "stock-critico") return "por-reponer";
  return isInventoryView(value) ? value : null;
}

export interface InventoryRowInput {
  stock: number;
  acqPrice?: number | null;
  price: number;
  isKit?: boolean | null;
  /** Señal de reposición por cobertura; sin ella la vista «Por reponer» cae al umbral. */
  signal?: ReplenishmentSignal | null;
}

export function inventoryMatchesView(row: InventoryRowInput, view: InventoryView, threshold = DEFAULT_LOW_STOCK_THRESHOLD): boolean {
  switch (view) {
    case "todo":
      return true;
    case "por-reponer":
      return row.signal ? row.signal.needsReplenishment : isLowStock(row.stock, threshold);
    case "agotados":
      return isOutOfStock(row.stock);
    case "sin-costo":
      return !row.isKit && !(Number(row.acqPrice) > 0);
    case "kits":
      return Boolean(row.isKit);
  }
}

/** Valor a costo y a venta de una fila; los kits no tienen stock propio. */
export function inventoryRowValue(row: InventoryRowInput): { cost: number; retail: number } {
  if (row.isKit) return { cost: 0, retail: 0 };
  const units = Math.max(0, row.stock);
  return { cost: units * (Number(row.acqPrice) || 0), retail: units * (Number(row.price) || 0) };
}

export interface InventoryTotals {
  products: number;
  units: number;
  costValue: number;
  retailValue: number;
  /** Productos en la vista «Por reponer». */
  lowStock: number;
  outOfStock: number;
  withoutCost: number;
  /** Se venden y se acaban en menos de una semana (o ya se acabaron). */
  runsOutThisWeek: number;
  /** Agotados que vendieron en los últimos 90 días. */
  outOfStockSelling: number;
  /** Con stock y sin ventas en 90 días. */
  dormant: number;
}

export function summarizeInventory(rows: InventoryRowInput[], threshold = DEFAULT_LOW_STOCK_THRESHOLD): InventoryTotals {
  return rows.reduce<InventoryTotals>(
    (acc, row) => {
      const value = inventoryRowValue(row);
      acc.products += 1;
      acc.units += row.isKit ? 0 : Math.max(0, row.stock);
      acc.costValue += value.cost;
      acc.retailValue += value.retail;
      if (inventoryMatchesView(row, "por-reponer", threshold)) acc.lowStock += 1;
      if (inventoryMatchesView(row, "agotados", threshold)) acc.outOfStock += 1;
      if (inventoryMatchesView(row, "sin-costo", threshold)) acc.withoutCost += 1;
      if (row.signal?.runsOutThisWeek) acc.runsOutThisWeek += 1;
      if (row.signal?.outOfStockSelling) acc.outOfStockSelling += 1;
      if (row.signal?.dormant) acc.dormant += 1;
      return acc;
    },
    { products: 0, units: 0, costValue: 0, retailValue: 0, lowStock: 0, outOfStock: 0, withoutCost: 0, runsOutThisWeek: 0, outOfStockSelling: 0, dormant: 0 },
  );
}

/** Nota corta para las tarjetas: de dónde sale el umbral. */
export function describeLowStockThreshold(threshold: number, fromSettings: boolean): string {
  return `${threshold} ${threshold === 1 ? "unidad" : "unidades"} o menos · ${fromSettings ? "según Ajustes" : "valor por defecto"}`;
}
