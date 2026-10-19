import { INVENTORY_VIEWS, inventoryMatchesView, inventoryRowValue, summarizeInventory, type InventoryTotals, type InventoryView } from "@/lib/inventory-views";
import {
  DEFAULT_INVENTORY_VIEW,
  INVENTORY_PAGE_SIZE,
  VIEWER_HIDDEN_INVENTORY_SORTS,
  type InventoryListQuery,
  type InventorySortColumn,
} from "@/lib/inventory-list-query";
import { compareUrgency, type ReplenishmentSignal } from "@/lib/replenishment";

/**
 * Inventario paginado en el servidor, como Productos: las filas ya llegan con
 * su señal de reposición (`getInventory`); aquí se aplican las mismas reglas
 * de vista, la búsqueda, el orden, la página de 25, los conteos de cada
 * pestaña, las cifras de la cabecera y «Por reponer» agrupado por proveedora.
 * Puro: no toca la base.
 */
export interface InventoryListRow {
  id: string;
  name: string;
  sku: string;
  categoryName: string | null;
  stock: number;
  price: number;
  isKit: boolean;
  onOrder: number;
  acqPrice?: number | null;
  supplier?: { id: string; name: string } | null;
  signal: ReplenishmentSignal;
}

export interface SupplierGroup<T> {
  id: string | null;
  name: string;
  rows: T[];
  onOrderUnits: number;
}

export interface InventoryListPage<T> {
  /** La página en pantalla; vacía cuando se muestra agrupado. */
  rows: T[];
  /** «Por reponer» agrupado por proveedora, con todas sus filas; null si no se pidió. */
  groups: SupplierGroup<T>[] | null;
  /** Conteo de cada pestaña con la búsqueda puesta: coincide con lo que lista. */
  counts: Record<InventoryView, number>;
  /** Cifras de la cabecera: toda la tienda, sin búsqueda. */
  totals: InventoryTotals;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  query: InventoryListQuery;
}

const foldText = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const collator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

const compare: Record<InventorySortColumn, (a: InventoryListRow, b: InventoryListRow) => number> = {
  product: (a, b) => collator.compare(a.name, b.name),
  stock: (a, b) => a.stock - b.stock,
  weekly: (a, b) => a.signal.weeklyRate - b.signal.weeklyRate,
  cover: (a, b) => (a.signal.coverDays ?? Number.MAX_SAFE_INTEGER) - (b.signal.coverDays ?? Number.MAX_SAFE_INTEGER),
  supplier: (a, b) => collator.compare(a.supplier?.name ?? "", b.supplier?.name ?? ""),
  acqPrice: (a, b) => (Number(a.acqPrice) || 0) - (Number(b.acqPrice) || 0),
  value: (a, b) => inventoryRowValue(a).cost - inventoryRowValue(b).cost,
  suggested: (a, b) => a.signal.suggested - b.signal.suggested,
};

/** Agrupa por proveedora, de la más urgente a la menos; las filas sin proveedora quedan al final. */
export function groupBySupplier<T extends InventoryListRow>(rows: readonly T[]): SupplierGroup<T>[] {
  const groups = new Map<string | null, SupplierGroup<T>>();
  for (const row of [...rows].sort(compareUrgency)) {
    const key = row.supplier?.id ?? null;
    const group = groups.get(key) ?? { id: key, name: row.supplier?.name ?? "Sin proveedor asignado", rows: [], onOrderUnits: 0 };
    group.rows.push(row);
    group.onOrderUnits += row.onOrder;
    groups.set(key, group);
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return b.rows.length - a.rows.length;
  });
}

/**
 * La cuenta de solo lectura no tiene costos ni proveedora: no ve «Sin costo»,
 * no ordena por esas columnas, no agrupa y sus cifras no llevan el valor a costo.
 */
function forViewer(query: InventoryListQuery): InventoryListQuery {
  return {
    ...query,
    view: query.view === "sin-costo" ? DEFAULT_INVENTORY_VIEW : query.view,
    sort: query.sort && VIEWER_HIDDEN_INVENTORY_SORTS.includes(query.sort.id) ? null : query.sort,
    groupBySupplier: false,
  };
}

export function paginateInventory<T extends InventoryListRow>(
  rows: readonly T[],
  requested: InventoryListQuery,
  options: { threshold: number; viewer?: boolean; pageSize?: number },
): InventoryListPage<T> {
  const query = options.viewer ? forViewer(requested) : requested;
  const pageSize = options.pageSize ?? INVENTORY_PAGE_SIZE;
  // Lo mismo que buscaba la tabla: nombre, SKU y subcategoría, sin tildes y en cualquier orden.
  const words = foldText(query.search).split(/\s+/).filter(Boolean).slice(0, 8);
  const searched = words.length
    ? rows.filter((row) => {
        const haystack = foldText([row.name, row.sku, row.categoryName].filter(Boolean).join(" "));
        return words.every((word) => haystack.includes(word));
      })
    : [...rows];

  const counts = Object.fromEntries(INVENTORY_VIEWS.map((view) => [view.id, 0])) as Record<InventoryView, number>;
  for (const row of searched) for (const { id } of INVENTORY_VIEWS) if (inventoryMatchesView(row, id, options.threshold)) counts[id] += 1;
  if (options.viewer) counts["sin-costo"] = 0;

  const totals = summarizeInventory([...rows], options.threshold);
  if (options.viewer) {
    totals.costValue = 0;
    totals.withoutCost = 0;
  }

  if (query.groupBySupplier) {
    const replenish = rows.filter((row) => inventoryMatchesView(row, "por-reponer", options.threshold));
    return { rows: [], groups: groupBySupplier(replenish), counts, totals, total: replenish.length, page: 1, pageCount: 1, pageSize, query };
  }

  const matching = searched.filter((row) => inventoryMatchesView(row, query.view, options.threshold));
  if (query.sort) {
    const { id, desc } = query.sort;
    // El orden de llegada desempata: `sort` es estable.
    matching.sort((a, b) => (desc ? -1 : 1) * compare[id](a, b));
  } else if (query.view === "por-reponer") {
    matching.sort(compareUrgency);
  }
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(query.page, pageCount);
  return {
    rows: matching.slice((page - 1) * pageSize, page * pageSize),
    groups: null,
    counts,
    totals,
    total: matching.length,
    page,
    pageCount,
    pageSize,
    query: { ...query, page },
  };
}
