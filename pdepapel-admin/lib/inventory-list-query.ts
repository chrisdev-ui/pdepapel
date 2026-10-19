import { normalizeInventoryView, type InventoryView } from "@/lib/inventory-views";

/**
 * La consulta de Inventario (vista, búsqueda, página, orden y agrupación) tal
 * como viaja en la URL. Sin Prisma: la usan la página del servidor y la
 * pantalla en el navegador.
 */
export const INVENTORY_PAGE_SIZE = 25;
export const DEFAULT_INVENTORY_VIEW: InventoryView = "por-reponer";
const MAX_SEARCH_LENGTH = 80;

export const INVENTORY_LIST_PARAMS = {
  view: "vista",
  search: "q",
  page: "pagina",
  sort: "orden",
  group: "agrupar",
} as const;

/** Valor de `agrupar` para «Por reponer» agrupado por proveedora. */
export const GROUP_BY_SUPPLIER = "proveedor";

export const INVENTORY_SORT_COLUMNS = ["product", "stock", "weekly", "cover", "supplier", "acqPrice", "value", "suggested"] as const;
export type InventorySortColumn = (typeof INVENTORY_SORT_COLUMNS)[number];

/** Columnas que ordenan por costo o proveedor: la cuenta de solo lectura no las tiene. */
export const VIEWER_HIDDEN_INVENTORY_SORTS: readonly InventorySortColumn[] = ["supplier", "acqPrice", "value"];

export interface InventoryListQuery {
  view: InventoryView;
  search: string;
  page: number;
  sort: { id: InventorySortColumn; desc: boolean } | null;
  groupBySupplier: boolean;
}

type SearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

const first = (value: string | string[] | null | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

function toQuery(params: SearchParams): URLSearchParams {
  if (params instanceof URLSearchParams) return params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const single = first(value);
    if (single !== null) query.set(key, single);
  }
  return query;
}

export function parseInventoryListQuery(params: SearchParams): InventoryListQuery {
  const query = toQuery(params);
  const view = normalizeInventoryView(query.get(INVENTORY_LIST_PARAMS.view)) ?? DEFAULT_INVENTORY_VIEW;
  const page = Number.parseInt(query.get(INVENTORY_LIST_PARAMS.page) ?? "1", 10);
  const sortParam = query.get(INVENTORY_LIST_PARAMS.sort) ?? "";
  const desc = sortParam.startsWith("-");
  const sortId = (desc ? sortParam.slice(1) : sortParam) as InventorySortColumn;
  return {
    view,
    search: (query.get(INVENTORY_LIST_PARAMS.search) ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    sort: INVENTORY_SORT_COLUMNS.includes(sortId) ? { id: sortId, desc } : null,
    groupBySupplier: view === "por-reponer" && query.get(INVENTORY_LIST_PARAMS.group) === GROUP_BY_SUPPLIER,
  };
}
