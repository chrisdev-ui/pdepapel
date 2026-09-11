import {
  getInventoryStatusMeta,
  isReturnMarketplaceOrderStatus,
  isRevenueMarketplaceOrderStatus,
} from "./order-status";

/**
 * Vistas de la lista de ventas de Mercado Libre (pestaña Ventas). Puro y
 * testeable: la API entrega las ventas y el cliente las agrupa aquí, igual
 * que las colas de Pedidos.
 */
export const SALES_VIEWS = [
  { id: "por-atender", label: "Por atender" },
  { id: "pagadas", label: "Pagadas" },
  { id: "devueltas", label: "Canceladas y reembolsos" },
  { id: "todas", label: "Todas" },
] as const;

export type SalesView = (typeof SALES_VIEWS)[number]["id"];
export const DEFAULT_SALES_VIEW: SalesView = "por-atender";

export function isSalesView(value: string | null | undefined): value is SalesView {
  return SALES_VIEWS.some((view) => view.id === value);
}

/** Lo que la lista necesita de cada venta para decidir vista, etiquetas y acciones. */
export interface SalesViewOrder {
  status: string;
  inventoryStatus: string;
  netAmount: number | null;
  /** `metadata.source === "HISTORICAL_RECONCILIATION"`: el neto lo escribió una persona. */
  historical: boolean;
  moneyReleaseStatus: string | null;
}

export type SaleAttention =
  | { kind: "resync"; label: string }
  | { kind: "restock"; label: string }
  | { kind: "settlement"; label: string }
  | null;

/**
 * Qué está pendiente en una venta. Decide la vista «Por atender» y la acción
 * de la fila: excepción → re-sincronizar; retorno pendiente → confirmar el
 * retorno físico; neto vacío → esperar la liquidación (sin acción manual).
 */
export function getSaleAttention(sale: SalesViewOrder): SaleAttention {
  const inventory = getInventoryStatusMeta(sale.inventoryStatus);
  if (isRevenueMarketplaceOrderStatus(sale.status) && inventory.action === "resync") {
    return { kind: "resync", label: "Re-sincronizar" };
  }
  if (isReturnMarketplaceOrderStatus(sale.status) && inventory.action === "restock") {
    return { kind: "restock", label: "Confirmar retorno físico" };
  }
  if (isRevenueMarketplaceOrderStatus(sale.status) && sale.netAmount === null) {
    return { kind: "settlement", label: "Esperando liquidación" };
  }
  return null;
}

export function saleMatchesView(sale: SalesViewOrder, view: SalesView): boolean {
  switch (view) {
    case "por-atender":
      return getSaleAttention(sale) !== null;
    case "pagadas":
      return isRevenueMarketplaceOrderStatus(sale.status);
    case "devueltas":
      return isReturnMarketplaceOrderStatus(sale.status);
    case "todas":
      return true;
    default:
      return false;
  }
}

export function countSalesByView(sales: SalesViewOrder[]): Record<SalesView, number> {
  const counts = { "por-atender": 0, pagadas: 0, devueltas: 0, todas: 0 } as Record<SalesView, number>;
  for (const sale of sales) {
    for (const view of SALES_VIEWS) {
      if (saleMatchesView(sale, view.id)) counts[view.id] += 1;
    }
  }
  return counts;
}

/**
 * De dónde sale el neto que muestra la fila. Un neto importado a mano nunca
 * se presenta como «confirmado por Mercado Libre»: nadie lo verificó.
 */
export function getSettlementLabel(sale: SalesViewOrder): string {
  if (isReturnMarketplaceOrderStatus(sale.status)) {
    return sale.status === "REFUNDED"
      ? "Sin ingreso: la venta fue reembolsada"
      : "Sin ingreso: la venta fue cancelada";
  }
  if (sale.historical) return "Neto ingresado a mano al importar la venta";
  if (sale.netAmount === null) return "Liquidación pendiente de Mercado Libre";
  if (sale.moneyReleaseStatus === "released") {
    return "Liquidación liberada por Mercado Libre";
  }
  return "Neto confirmado por Mercado Libre";
}

/**
 * Qué se muestra en la columna Neto. Una venta cancelada o reembolsada puede
 * conservar el neto que se calculó antes de cancelarse; mostrarlo se lee como
 * dinero ganado, así que va «—».
 */
export function getSaleNetDisplay(sale: SalesViewOrder, format: (value: number) => string): string {
  if (isReturnMarketplaceOrderStatus(sale.status)) return "—";
  if (sale.netAmount === null) return "Pendiente";
  return format(sale.netAmount);
}
