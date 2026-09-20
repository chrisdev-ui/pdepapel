import { RestockOrderStatus } from "@prisma/client";

/**
 * Vistas de la lista de Aprovisionamiento, resumen de cabecera y fecha
 * esperada de llegada. Puro y testeable, con la misma forma que
 * `lib/inventory-views.ts`.
 */

export type RestockView = "todo" | "borradores" | "al-proveedor" | "recibiendo" | "completados" | "cancelados";

export const RESTOCK_VIEWS: { id: RestockView; label: string }[] = [
  { id: "todo", label: "Todo" },
  { id: "borradores", label: "Borradores" },
  { id: "al-proveedor", label: "Al proveedor" },
  { id: "recibiendo", label: "Recibiendo" },
  { id: "completados", label: "Completados" },
  { id: "cancelados", label: "Cancelados" },
];

export const DEFAULT_RESTOCK_VIEW: RestockView = "todo";

export const isRestockView = (value: string | null | undefined): value is RestockView =>
  RESTOCK_VIEWS.some((view) => view.id === value);

/** Pedidos hechos que todavía esperan mercancía. */
export const OPEN_RESTOCK_STATUSES: ReadonlySet<RestockOrderStatus> = new Set<RestockOrderStatus>([
  RestockOrderStatus.ORDERED,
  RestockOrderStatus.PARTIALLY_RECEIVED,
]);

export interface RestockRowInput {
  status: RestockOrderStatus;
  createdAt: Date;
  totalAmount: number;
  shippingCost: number;
  progress: { remainingUnits: number };
  /** Días habituales del proveedor entre pedir y recibir; `null` si no se registró. */
  supplierLeadTimeDays?: number | null;
}

export function restockMatchesView(row: { status: RestockOrderStatus }, view: RestockView): boolean {
  switch (view) {
    case "todo":
      return true;
    case "borradores":
      return row.status === RestockOrderStatus.DRAFT;
    case "al-proveedor":
      return row.status === RestockOrderStatus.ORDERED;
    case "recibiendo":
      return row.status === RestockOrderStatus.PARTIALLY_RECEIVED;
    case "completados":
      return row.status === RestockOrderStatus.COMPLETED;
    case "cancelados":
      return row.status === RestockOrderStatus.CANCELLED;
  }
}

/* ── Cuándo llega ───────────────────────────────────────────────────────── */

export type ExpectedArrivalState =
  /** El proveedor no tiene plazo registrado: no se inventa una fecha. */
  | "sin-plazo"
  /** El pedido ya se cerró: la fecha esperada dejó de importar. */
  | "cerrado"
  /** Todavía no se ha pedido, así que el plazo no ha empezado a correr. */
  | "sin-pedir"
  | "en-plazo"
  | "hoy"
  | "retrasado";

export interface ExpectedArrival {
  state: ExpectedArrivalState;
  /** Fecha estimada; `null` cuando no se puede calcular. */
  date: Date | null;
  /** Días de retraso cuando `state` es «retrasado»; 0 en los demás casos. */
  overdueDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const atMidnight = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

/**
 * Cuándo debería llegar un pedido: la fecha en que se pidió más el plazo del
 * proveedor. Sin plazo registrado no se estima nada, porque una fecha
 * inventada en una pantalla de compras es peor que no tener ninguna.
 */
export function expectedArrival(row: RestockRowInput, now = new Date()): ExpectedArrival {
  const none = { date: null, overdueDays: 0 };
  if (row.status === RestockOrderStatus.COMPLETED || row.status === RestockOrderStatus.CANCELLED) {
    return { state: "cerrado", ...none };
  }
  if (row.status === RestockOrderStatus.DRAFT) return { state: "sin-pedir", ...none };

  const lead = row.supplierLeadTimeDays;
  if (lead === null || lead === undefined || !Number.isFinite(lead) || lead < 0) {
    return { state: "sin-plazo", ...none };
  }

  const date = new Date(row.createdAt.getTime() + lead * DAY_MS);
  const diffDays = Math.round((atMidnight(date).getTime() - atMidnight(now).getTime()) / DAY_MS);
  if (diffDays > 0) return { state: "en-plazo", date, overdueDays: 0 };
  if (diffDays === 0) return { state: "hoy", date, overdueDays: 0 };
  return { state: "retrasado", date, overdueDays: Math.abs(diffDays) };
}

export const isOverdue = (arrival: ExpectedArrival): boolean => arrival.state === "retrasado";

/* ── Resumen de cabecera ────────────────────────────────────────────────── */

export interface RestockTotals {
  /** Pedidos hechos que todavía esperan mercancía. */
  waiting: number;
  /** Unidades pedidas que aún no llegan. */
  unitsInTransit: number;
  /** Mercancía más envío de lo que sigue abierto. */
  committed: number;
  /** Pedidos abiertos que ya pasaron el plazo del proveedor. */
  overdue: number;
  byView: Record<RestockView, number>;
}

export function summarizeRestockOrders(rows: RestockRowInput[], options: { now?: Date } = {}): RestockTotals {
  const now = options.now ?? new Date();
  const totals: RestockTotals = {
    waiting: 0,
    unitsInTransit: 0,
    committed: 0,
    overdue: 0,
    byView: { todo: 0, borradores: 0, "al-proveedor": 0, recibiendo: 0, completados: 0, cancelados: 0 },
  };

  for (const row of rows) {
    for (const { id } of RESTOCK_VIEWS) {
      if (restockMatchesView(row, id)) totals.byView[id] += 1;
    }
    if (!OPEN_RESTOCK_STATUSES.has(row.status)) continue;
    totals.waiting += 1;
    totals.unitsInTransit += Math.max(0, row.progress.remainingUnits);
    totals.committed += (Number(row.totalAmount) || 0) + (Number(row.shippingCost) || 0);
    if (isOverdue(expectedArrival(row, now))) totals.overdue += 1;
  }

  return totals;
}
