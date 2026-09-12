"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { INVENTORY_VIEWS, inventoryMatchesView, inventoryRowValue, normalizeInventoryView, summarizeInventory, type InventoryView } from "@/lib/inventory-views";
import { isOutOfStock } from "@/lib/product-readiness";
import { compareUrgency, describeCover, DORMANT_WINDOW_DAYS, SALES_WINDOW_DAYS, TARGET_WEEKS } from "@/lib/replenishment";
import { cn, currencyFormatter } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Boxes, History, LayoutList, MoreHorizontal, Package, Truck, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AdjustInventoryModal } from "../../movimientos-inventario/components/adjust-inventory-modal";
import type { InventoryRow } from "../server/get-inventory";
import { ReplenishmentBySupplier } from "./replenishment-by-supplier";

const VIEW_PARAM = "vista";
const GROUP_PARAM = "agrupar";
const DEFAULT_VIEW: InventoryView = "por-reponer";

/** Borrador de reposición con proveedor y producto ya diligenciados. */
function restockHref(storeId: string, row: Pick<InventoryRow, "id" | "supplier">): string {
  const query = new URLSearchParams();
  if (row.supplier?.id) query.set("proveedor", row.supplier.id);
  query.set("producto", row.id);
  return `/${storeId}/aprovisionamiento/nuevo?${query.toString()}`;
}

const TONE_BAR: Record<string, string> = { pink: "bg-[#E11D48]", cream: "bg-[#D97706]", mint: "bg-tint-mint", slate: "bg-border" };

function CoverCell({ row }: { row: InventoryRow }) {
  const cover = describeCover(row.signal, { limitingComponent: row.limitingComponent });
  return (
    <div className="flex min-w-[150px] flex-col gap-1.5">
      <span className={cn("text-xs font-semibold", cover.tone === "slate" ? "text-muted-foreground" : "text-primary")}>{cover.label}</span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full", TONE_BAR[cover.tone])} style={{ width: `${cover.percent}%` }} />
      </div>
    </div>
  );
}

function StockCell({ row }: { row: InventoryRow }) {
  if (isOutOfStock(row.stock)) return <TintBadge label="Agotado" tone="pink" />;
  if (row.signal.needsReplenishment) return <TintBadge label={`${row.stock} und`} tone={row.signal.runsOutThisWeek ? "pink" : "cream"} />;
  return <span className="text-sm font-semibold tabular-nums text-primary">{row.stock}</span>;
}

function Metric({ label, value, note, icon, tint }: { label: string; value: string; note?: string; icon: React.ReactNode; tint: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between"><span className="text-[13px] font-semibold text-muted-foreground">{label}</span><span className={cn("flex h-8 w-8 items-center justify-center rounded-lg text-primary", tint)}>{icon}</span></div>
      <span className="text-[24px] font-bold leading-none tracking-tight text-primary">{value}</span>
      {note && <span className="truncate text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

interface InventoryClientProps {
  data: InventoryRow[];
  /** Umbral de stock crítico ya resuelto (`resolveLowStockThreshold`); respaldo cuando no hay ventas. */
  threshold: number;
  thresholdFromSettings?: boolean;
  initialView?: string | null;
  initialGrouped?: boolean;
}

export function InventoryClient({ data, threshold, thresholdFromSettings = false, initialView = null, initialGrouped = false }: InventoryClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);
  const [view, setViewState] = useState<InventoryView>(normalizeInventoryView(initialView ?? searchParams.get(VIEW_PARAM)) ?? DEFAULT_VIEW);
  const [grouped, setGroupedState] = useState(initialGrouped || searchParams.get(GROUP_PARAM) === "proveedor");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);

  const totals = useMemo(() => summarizeInventory(data, threshold), [data, threshold]);
  const counts = useMemo(() => Object.fromEntries(INVENTORY_VIEWS.map((v) => [v.id, data.filter((row) => inventoryMatchesView(row, v.id, threshold)).length])) as Record<InventoryView, number>, [data, threshold]);
  const rows = useMemo(() => {
    const filtered = data.filter((row) => inventoryMatchesView(row, view, threshold));
    return view === "por-reponer" ? [...filtered].sort(compareUrgency) : filtered;
  }, [data, view, threshold]);

  const openAdjust = (productId: string | null) => {
    setAdjustProductId(productId);
    setAdjustOpen(true);
  };

  const replaceQuery = (nextView: InventoryView, nextGrouped: boolean) => {
    const query = new URLSearchParams(searchParams.toString());
    if (nextView === DEFAULT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, nextView);
    if (nextGrouped && nextView === "por-reponer") query.set(GROUP_PARAM, "proveedor");
    else query.delete(GROUP_PARAM);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };
  const setView = (next: InventoryView) => {
    setViewState(next);
    replaceQuery(next, grouped);
  };
  const setGrouped = (next: boolean) => {
    setGroupedState(next);
    replaceQuery(view, next);
  };

  const columns = useMemo<ColumnDef<InventoryRow>[]>(() => [
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
    { id: "value", accessorFn: (row) => inventoryRowValue(row).cost, header: ({ column }) => <DataTableColumnHeader column={column} title="Valor a costo" />, cell: ({ row }) => <DataTableCellCurrency value={inventoryRowValue(row.original).cost} />, enableGlobalFilter: false },
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
            <Button asChild variant="ghost" size="sm"><Link href={`/${storeId}/ofertas/nuevo`}>Poner en oferta</Link></Button>
          ) : (
            <Button asChild variant="outline" size="sm"><Link href={restockHref(storeId, row.original)}>Reponer</Link></Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openAdjust(row.original.isKit ? null : row.original.id)}>Ajustar inventario</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(restockHref(storeId, row.original))}>Reponer con el proveedor{row.original.supplier ? ` (${row.original.supplier.name})` : ""}</DropdownMenuItem>
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
  ], [router, storeId]);

  const showGrouped = view === "por-reponer" && grouped;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Inventario</h1>
          <p className="text-sm text-muted-foreground">Qué se acaba primero según lo que se vende, no solo cuántas unidades quedan. Los kits se calculan desde sus componentes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => openAdjust(null)}><History className="h-4 w-4" aria-hidden="true" />Ajustar inventario</Button>
          <Button asChild><Link href={`/${storeId}/aprovisionamiento/nuevo`}><Package className="h-4 w-4" aria-hidden="true" />Nueva orden de aprovisionamiento</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Metric label="Se acaban esta semana" value={totals.runsOutThisWeek.toLocaleString("es-CO")} note={`Con ventas en ${SALES_WINDOW_DAYS} días y menos de 7 días de cobertura`} icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-pink" />
        <Metric label="Agotados que se vendían" value={totals.outOfStockSelling.toLocaleString("es-CO")} note={`De ${totals.outOfStock.toLocaleString("es-CO")} agotados; el resto no vendió en ${DORMANT_WINDOW_DAYS} días`} icon={<Truck className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-cream" />
        <Metric label="Valor a costo" value={currencyFormatter(totals.costValue)} note={`${totals.units.toLocaleString("es-CO")} unidades · a venta ${currencyFormatter(totals.retailValue)}`} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-mint" />
        <Metric label={`Sin movimiento en ${DORMANT_WINDOW_DAYS} días`} value={totals.dormant.toLocaleString("es-CO")} note="Candidatos a oferta antes que a reposición" icon={<Boxes className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-sky" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Vistas de inventario" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
          {INVENTORY_VIEWS.map((item) => {
            const active = item.id === view;
            return (
              <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => setView(item.id)} className={cn("flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent")}>
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{counts[item.id]}</span>
              </button>
            );
          })}
        </div>
        {view === "por-reponer" && (
          <Button type="button" variant="outline" size="sm" onClick={() => setGrouped(!grouped)} aria-pressed={grouped}>
            {grouped ? <LayoutList className="h-4 w-4" aria-hidden="true" /> : <Truck className="h-4 w-4" aria-hidden="true" />}
            {grouped ? "Ver como lista" : "Agrupar por proveedor"}
          </Button>
        )}
      </div>

      {view === "por-reponer" && (
        <p className="text-xs text-muted-foreground">
          Cobertura = stock ÷ ventas por día de los últimos {SALES_WINDOW_DAYS} días. Sugerido = {TARGET_WEEKS} semanas de venta menos el stock y lo que viene en camino. Sin ventas recientes, cuenta el umbral de Ajustes ({threshold} {threshold === 1 ? "unidad" : "unidades"}{thresholdFromSettings ? "" : ", valor por defecto"}).
        </p>
      )}

      {showGrouped ? (
        <ReplenishmentBySupplier rows={rows} storeId={storeId} />
      ) : (
        <DataTable
          tableKey={Models.Inventory}
          searchPlaceholder="Buscar por nombre, SKU o subcategoría…"
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          onRowClick={(row) => router.push(`/${storeId}/productos/${row.id}`)}
          emptyState={view === "todo" ? { title: "Aún no hay productos con stock" } : { title: "Nada en esta vista", description: view === "por-reponer" ? "Todo lo que se vende tiene cobertura." : view === "agotados" ? "No hay productos agotados." : view === "sin-costo" ? "Todos los productos tienen costo de compra." : "No hay kits." }}
        />
      )}

      <AdjustInventoryModal
        isOpen={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        onConfirm={() => { setAdjustOpen(false); router.refresh(); }}
        products={data.filter((row) => !row.isKit).map((row) => ({ id: row.id, name: row.name, stock: row.stock }))}
        defaultProductId={adjustProductId}
      />
    </div>
  );
}
