"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MetricCard } from "@/components/ui/metric-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { TintBadge } from "@/components/ui/tint-badge";
import { buildOfferPreselectionHref } from "@/lib/offer-preselection";
import { Models } from "@/constants";
import { useCanWrite } from "@/components/shell/viewer-access";
import { INVENTORY_VIEWS, inventoryRowValue, type InventoryView } from "@/lib/inventory-views";
import { DEFAULT_INVENTORY_VIEW, GROUP_BY_SUPPLIER, INVENTORY_LIST_PARAMS } from "@/lib/inventory-list-query";
import { isOutOfStock } from "@/lib/product-readiness";
import { describeCover, DORMANT_WINDOW_DAYS, SALES_WINDOW_DAYS, TARGET_WEEKS } from "@/lib/replenishment";
import { cn, currencyFormatter } from "@/lib/utils";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { AlertTriangle, Boxes, History, LayoutList, MoreHorizontal, Package, Truck, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AdjustInventoryModal } from "../../movimientos-inventario/components/adjust-inventory-modal";
import type { InventoryPage, InventoryRow } from "../server/get-inventory";
import { ReplenishmentBySupplier, restockHref } from "./replenishment-by-supplier";

const SEARCH_DELAY_MS = 350;

/** Costo y proveedor: el servidor no los manda a una cuenta de solo lectura. */
const HIDDEN_FOR_VIEWER = ["supplier", "acqPrice", "value"];

/** El id con el que se identifica una columna, venga de `id` o de `accessorKey`. */
function columnId<T>(column: ColumnDef<T>): string {
  if ("id" in column && column.id) return column.id;
  if ("accessorKey" in column && column.accessorKey) return String(column.accessorKey);
  return "";
}

const TONE_BAR: Record<string, string> = { pink: "bg-[#E11D48]", cream: "bg-[#D97706]", mint: "bg-tint-mint", slate: "bg-border" };

function CoverCell({ row }: { row: InventoryRow }) {
  const cover = describeCover(row.signal, { limitingComponent: row.limitingComponent });
  return (
    <div className="flex min-w-[150px] flex-col gap-1.5">
      <span className={cn("text-xs font-semibold", cover.tone === "slate" ? "text-muted-foreground" : "text-primary")}>{cover.label}</span>
      <ProgressBar percent={cover.percent} barClassName={TONE_BAR[cover.tone]} />
    </div>
  );
}

function StockCell({ row }: { row: InventoryRow }) {
  if (isOutOfStock(row.stock)) return <TintBadge label="Agotado" tone="pink" />;
  if (row.signal.needsReplenishment) return <TintBadge label={`${row.stock} und`} tone={row.signal.runsOutThisWeek ? "pink" : "cream"} />;
  return <span className="text-sm font-semibold tabular-nums text-primary">{row.stock}</span>;
}

interface InventoryClientProps {
  /** La página (o los grupos), los conteos y las cifras, ya calculados en el servidor con la consulta de la URL. */
  list: Omit<InventoryPage, "store" | "threshold">;
  /** Umbral de stock crítico ya resuelto (`resolveLowStockThreshold`); respaldo cuando no hay ventas. */
  threshold: number;
  thresholdFromSettings?: boolean;
}

export function InventoryClient({ list, threshold, thresholdFromSettings = false }: InventoryClientProps) {
  // Sin permiso de escritura no hay costos que mostrar ni acciones que ofrecer:
  // el servidor ya manda la fila sin `acqPrice`, aquí se quitan las columnas.
  const canWrite = useCanWrite();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useParams();
  const storeId = String(params.storeId);
  const [, startTransition] = useTransition();
  // La vista, la búsqueda, la página, el orden y la agrupación vienen de la
  // URL ya resueltos por el servidor (a solo lectura no le llega «Sin costo»).
  const { query, totals, counts, rows } = list;
  const view = query.view;
  const grouped = query.groupBySupplier;
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);

  // «Sin costo» existe solo para encontrar productos a los que les falta el
  // precio de compra: no tiene sentido sin costos a la vista.
  const views = useMemo(() => (canWrite ? INVENTORY_VIEWS : INVENTORY_VIEWS.filter((v) => v.id !== "sin-costo")), [canWrite]);

  const openAdjust = (productId: string | null) => {
    setAdjustProductId(productId);
    setAdjustOpen(true);
  };

  /**
   * Todo vive en la URL, como en Productos: pestaña, página, orden y
   * agrupación dejan entrada en el historial; la búsqueda reemplaza la suya.
   */
  const navigate = useCallback(
    (change: (params: URLSearchParams) => void, history: "push" | "replace" = "push") => {
      const next = new URLSearchParams(window.location.search);
      change(next);
      const suffix = next.toString();
      const href = suffix ? `${pathname}?${suffix}` : pathname;
      if (href === `${pathname}${window.location.search}`) return;
      startTransition(() => (history === "push" ? router.push(href, { scroll: false }) : router.replace(href, { scroll: false })));
    },
    [pathname, router],
  );
  const setView = (next: InventoryView) =>
    navigate((params) => {
      if (next === DEFAULT_INVENTORY_VIEW) params.delete(INVENTORY_LIST_PARAMS.view);
      else params.set(INVENTORY_LIST_PARAMS.view, next);
      if (next !== "por-reponer") params.delete(INVENTORY_LIST_PARAMS.group);
      params.delete(INVENTORY_LIST_PARAMS.page);
    });
  const setGrouped = (next: boolean) =>
    navigate((params) => {
      if (next) params.set(INVENTORY_LIST_PARAMS.group, GROUP_BY_SUPPLIER);
      else params.delete(INVENTORY_LIST_PARAMS.group);
      params.delete(INVENTORY_LIST_PARAMS.page);
    });
  const setPage = useCallback(
    (next: number) =>
      navigate((params) => {
        if (next <= 1) params.delete(INVENTORY_LIST_PARAMS.page);
        else params.set(INVENTORY_LIST_PARAMS.page, String(next));
      }),
    [navigate],
  );
  const sorting = useMemo<SortingState>(() => (query.sort ? [query.sort] : []), [query.sort]);
  const setSorting = useCallback(
    (next: SortingState) =>
      navigate((params) => {
        const [first] = next;
        if (first) params.set(INVENTORY_LIST_PARAMS.sort, `${first.desc ? "-" : ""}${first.id}`);
        else params.delete(INVENTORY_LIST_PARAMS.sort);
        params.delete(INVENTORY_LIST_PARAMS.page);
      }),
    [navigate],
  );
  // La búsqueda espera a que se deje de escribir para no pedir una página por letra.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );
  const setSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(
        () =>
          navigate((params) => {
            const text = value.trim();
            if (text) params.set(INVENTORY_LIST_PARAMS.search, text);
            else params.delete(INVENTORY_LIST_PARAMS.search);
            params.delete(INVENTORY_LIST_PARAMS.page);
          }, "replace"),
        SEARCH_DELAY_MS,
      );
    },
    [navigate],
  );

  const columns = useMemo<ColumnDef<InventoryRow>[]>(() => {
    const all: ColumnDef<InventoryRow>[] = [
    {
      id: "product",
      accessorFn: (row) => [row.name, row.sku, row.categoryName].filter(Boolean).join(" "),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Producto" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.image ? <Image src={row.original.image} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Package className="h-4 w-4" aria-hidden="true" /></span>}
          <div className="flex min-w-0 max-w-[260px] flex-col gap-0.5">
            <Link href={`/${storeId}/productos/${row.original.id}`} className="truncate font-semibold text-primary hover:underline" title={row.original.name}>{row.original.name}</Link>
            <span className="truncate text-xs text-muted-foreground">{row.original.sku}{row.original.categoryName ? ` · ${row.original.categoryName}` : ""}{row.original.isKit ? " · kit" : ""}</span>
          </div>
        </div>
      ),
    },
    { accessorKey: "stock", header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />, cell: ({ row }) => <StockCell row={row.original} />, enableGlobalFilter: false },
    { id: "weekly", accessorFn: (row) => row.signal.weeklyRate, header: ({ column }) => <DataTableColumnHeader column={column} title="Vende/sem" />, cell: ({ row }) => <span className={cn("font-mono text-xs", row.original.signal.weeklyRate > 0 ? "text-primary" : "text-muted-foreground")}>{row.original.signal.weeklyRate.toLocaleString("es-CO", { maximumFractionDigits: 1 })}</span>, enableGlobalFilter: false },
    { id: "cover", accessorFn: (row) => row.signal.coverDays ?? Number.MAX_SAFE_INTEGER, header: ({ column }) => <DataTableColumnHeader column={column} title="Cobertura" />, cell: ({ row }) => <CoverCell row={row.original} />, enableGlobalFilter: false },
    { id: "supplier", accessorFn: (row) => row.supplier?.name ?? "", header: ({ column }) => <DataTableColumnHeader column={column} title="Proveedor" />, cell: ({ row }) => row.original.supplier ? <span className="text-sm">{row.original.supplier.name}</span> : <span className="text-xs text-muted-foreground">Sin proveedor</span> },
    { accessorKey: "acqPrice", header: ({ column }) => <DataTableColumnHeader column={column} title="Costo unit." />, cell: ({ row }) => (row.original.isKit ? <span className="text-xs text-muted-foreground">componentes</span> : Number(row.original.acqPrice) > 0 ? <DataTableCellCurrency value={Number(row.original.acqPrice)} /> : <TintBadge label="Sin costo" tone="cream" />), enableGlobalFilter: false },
    { id: "value", accessorFn: (row) => inventoryRowValue(row).cost, header: ({ column }) => <DataTableColumnHeader column={column} title="Valor a costo" />, cell: ({ row }) => (row.original.isKit ? <span className="text-xs text-muted-foreground">—</span> : <DataTableCellCurrency value={inventoryRowValue(row.original).cost} />), enableGlobalFilter: false },
    {
      id: "suggested",
      accessorFn: (row) => row.signal.suggested,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sugerido" />,
      cell: ({ row }) => (row.original.signal.suggested > 0 ? <span className="font-mono text-xs text-primary">{row.original.signal.suggested}{row.original.isKit ? " (componentes)" : ""}{row.original.onOrder > 0 ? ` · ${row.original.onOrder} en camino` : ""}</span> : <span className="text-xs text-muted-foreground">—</span>),
      enableGlobalFilter: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1" data-no-row-click>
          {row.original.signal.dormant ? (
            <Button asChild variant="ghost" size="sm"><Link href={buildOfferPreselectionHref(storeId, [row.original.id])}>Poner en oferta</Link></Button>
          ) : row.original.isKit ? (
            <Button asChild variant="ghost" size="sm" title="Un kit no se compra: se reponen sus componentes"><Link href={`/${storeId}/productos/${row.original.id}`}>Ver componentes</Link></Button>
          ) : (
            <Button asChild variant="outline" size="sm"><Link href={restockHref(storeId, row.original)}>Reponer</Link></Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canWrite ? (
                <DropdownMenuItem onClick={() => openAdjust(row.original.isKit ? null : row.original.id)}>Ajustar inventario</DropdownMenuItem>
              ) : null}
              {canWrite && !row.original.isKit && (
                <DropdownMenuItem onClick={() => router.push(restockHref(storeId, row.original))}>Reponer con el proveedor{row.original.supplier ? ` (${row.original.supplier.name})` : ""}</DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => router.push(`/${storeId}/movimientos-inventario/producto/${row.original.id}`)}>Ver kardex</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${storeId}/productos/${row.original.id}`)}>Abrir producto</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      enableGlobalFilter: false,
    },
    ];
    if (canWrite) return all;
    // El servidor ya no manda estos datos; la columna quedaría vacía y, peor,
    // prometería algo que la cuenta de solo lectura no puede ver.
    return all.filter((column) => !HIDDEN_FOR_VIEWER.includes(columnId(column)));
  }, [router, storeId, canWrite]);

  const showGrouped = canWrite && view === "por-reponer" && grouped && list.groups !== null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Inventario</h1>
          <p className="text-sm text-muted-foreground">Qué se acaba primero según lo que se vende, no solo cuántas unidades quedan. Los kits se calculan desde sus componentes.</p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => openAdjust(null)}><History className="h-4 w-4" aria-hidden="true" />Ajustar inventario</Button>
            <Button asChild><Link href={`/${storeId}/aprovisionamiento/nuevo`}><Package className="h-4 w-4" aria-hidden="true" />Nueva orden de aprovisionamiento</Link></Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard label="Se acaban esta semana" value={totals.runsOutThisWeek.toLocaleString("es-CO")} note={`Con stock, ventas en ${DORMANT_WINDOW_DAYS} días y menos de 7 días de cobertura`} icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-pink" />
        <MetricCard label="Agotados que se vendían" value={totals.outOfStockSelling.toLocaleString("es-CO")} note={`De ${totals.outOfStock.toLocaleString("es-CO")} agotados; el resto no vendió en ${DORMANT_WINDOW_DAYS} días`} icon={<Truck className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-cream" />
        {canWrite ? (
          <MetricCard label="Valor a costo" value={currencyFormatter(totals.costValue)} note={`${totals.units.toLocaleString("es-CO")} unidades · a venta ${currencyFormatter(totals.retailValue)}`} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-mint" />
        ) : (
          <MetricCard label="Unidades en stock" value={totals.units.toLocaleString("es-CO")} note={`Valor a venta ${currencyFormatter(totals.retailValue)}`} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-mint" />
        )}
        <MetricCard label={`Sin movimiento en ${DORMANT_WINDOW_DAYS} días`} value={totals.dormant.toLocaleString("es-CO")} note="Candidatos a oferta antes que a reposición" icon={<Boxes className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-sky" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Vistas de inventario" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
          {views.map((item) => {
            const active = item.id === view;
            return (
              <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => setView(item.id)} className={cn("flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent")}>
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{counts[item.id]}</span>
              </button>
            );
          })}
        </div>
        {/* Agrupar por proveedor no dice nada sin proveedor, y el servidor no
            se lo manda a una cuenta de solo lectura. */}
        {canWrite && view === "por-reponer" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setGrouped(!grouped)} aria-pressed={grouped}>
            {grouped ? <LayoutList className="h-4 w-4" aria-hidden="true" /> : <Truck className="h-4 w-4" aria-hidden="true" />}
            {grouped ? "Ver como lista" : "Agrupar por proveedor"}
          </Button>
        )}
      </div>

      {view === "todo" && (
        <p className="text-xs text-muted-foreground">
          Las cápsulas sorpresa no se cuentan aquí: se arman con productos que ya están en la lista.
        </p>
      )}

      {view === "por-reponer" && (
        <p className="text-xs text-muted-foreground">
          Cobertura = stock ÷ ventas por día de los últimos {SALES_WINDOW_DAYS} días; si no vendió en {SALES_WINDOW_DAYS} días pero sí en {DORMANT_WINDOW_DAYS}, cuenta ese ritmo. Lo vendido dentro de kits suma a cada componente. Sugerido = {TARGET_WEEKS} semanas de venta menos el stock y lo que viene en camino. Un producto con ventas en {SALES_WINDOW_DAYS} días y {threshold} {threshold === 1 ? "unidad" : "unidades"} o menos ({thresholdFromSettings ? "umbral de Ajustes" : "umbral por defecto"}) también entra.
        </p>
      )}

      {showGrouped ? (
        <ReplenishmentBySupplier groups={list.groups ?? []} storeId={storeId} />
      ) : (
        <DataTable
          tableKey={Models.Inventory}
          searchPlaceholder="Buscar por nombre, SKU o subcategoría…"
          columns={columns}
          data={rows}
          server={{
            page: list.page,
            pageCount: list.pageCount,
            total: list.total,
            pageSize: list.pageSize,
            search: query.search,
            onSearchChange: setSearch,
            onPageChange: setPage,
            sorting,
            onSortingChange: setSorting,
          }}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/${storeId}/productos/${row.id}`)}
          emptyState={view === "todo" ? { title: "Aún no hay productos con stock" } : { title: "Nada en esta vista", description: view === "por-reponer" ? "Todo lo que se vende tiene cobertura." : view === "agotados" ? "No hay productos agotados." : view === "sin-costo" ? "Todos los productos tienen costo de compra." : "No hay kits." }}
        />
      )}

      <AdjustInventoryModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onConfirm={() => { setAdjustOpen(false); router.refresh(); }}
        defaultProductId={adjustProductId}
      />
    </div>
  );
}
