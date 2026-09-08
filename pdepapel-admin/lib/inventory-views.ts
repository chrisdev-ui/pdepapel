import { TRESHOLD_LOW_STOCK } from "@/constants";

/** Vistas de la lista de Inventario y valorización por fila. Puro y testeable. */

export type InventoryView = "todo" | "stock-critico" | "agotados" | "sin-costo" | "kits";

export const INVENTORY_VIEWS: { id: InventoryView; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "stock-critico", label: "Stock crítico" },
  { id: "agotados", label: "Agotados" },
  { id: "sin-costo", label: "Sin costo" },
  { id: "kits", label: "Kits" },
];

export const isInventoryView = (value: string | null | undefined): value is InventoryView => INVENTORY_VIEWS.some((v) => v.id === value);

export interface InventoryRowInput {
  stock: number;
  acqPrice?: number | null;
  price: number;
  isKit?: boolean | null;
}

export function inventoryMatchesView(row: InventoryRowInput, view: InventoryView, threshold = TRESHOLD_LOW_STOCK): boolean {
  switch (view) {
    case "todo":
      return true;
    case "stock-critico":
      return row.stock > 0 && row.stock <= threshold;
    case "agotados":
      return row.stock <= 0;
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
  lowStock: number;
  outOfStock: number;
  withoutCost: number;
}

export function summarizeInventory(rows: InventoryRowInput[], threshold = TRESHOLD_LOW_STOCK): InventoryTotals {
  return rows.reduce<InventoryTotals>(
    (acc, row) => {
      const value = inventoryRowValue(row);
      acc.products += 1;
      acc.units += row.isKit ? 0 : Math.max(0, row.stock);
      acc.costValue += value.cost;
      acc.retailValue += value.retail;
      if (inventoryMatchesView(row, "stock-critico", threshold)) acc.lowStock += 1;
      if (inventoryMatchesView(row, "agotados", threshold)) acc.outOfStock += 1;
      if (inventoryMatchesView(row, "sin-costo", threshold)) acc.withoutCost += 1;
      return acc;
    },
    { products: 0, units: 0, costValue: 0, retailValue: 0, lowStock: 0, outOfStock: 0, withoutCost: 0 },
  );
}
