"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Models } from "@/constants";
import { describeLowStockThreshold, INVENTORY_VIEWS, inventoryMatchesView, inventoryRowValue, isInventoryView, summarizeInventory, type InventoryView } from "@/lib/inventory-views";
import { isLowStock, isOutOfStock } from "@/lib/product-readiness";
import { cn, currencyFormatter } from "@/lib/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { formatDistanceToNowStrict } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Boxes, History, MoreHorizontal, Package, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { AdjustInventoryModal } from "../../movimientos-inventario/components/adjust-inventory-modal";
import type { InventoryRow } from "../server/get-inventory";

const VIEW_PARAM = "vista";
const DEFAULT_VIEW: InventoryView = "todo";
const MOVEMENT_LABEL: Record<string, string> = {
  ORDER_PLACED: "venta", ORDER_CANCELLED: "cancelación", MANUAL_ADJUSTMENT: "ajuste", INITIAL_MIGRATION: "migración", RETURN: "devolución", DAMAGE: "daño", LOST: "pérdida", PROMOTION: "promoción", PURCHASE: "compra", INITIAL_INTAKE: "ingreso inicial", RESTOCK_RECEIVED: "reposición", STORE_USE: "uso interno", FESTIVAL_ALLOCATION: "reserva de feria", FESTIVAL_RETURN: "retorno de feria", IN_PERSON_SALE: "venta presencial",
};

/**
 * Borrador de reposición con proveedor y producto en la URL. El formulario de
 * aprovisionamiento todavía no lee estos parámetros; se pasan para cuando lo haga.
 */
function restockHref(storeId: string, row: Pick<InventoryRow, "id" | "supplier">): string {
  const query = new URLSearchParams();
  if (row.supplier?.id) query.set("proveedor", row.supplier.id);
  query.set("producto", row.id);
  return `/${storeId}/aprovisionamiento/nuevo?${query.toString()}`;
}

function StockCell({ row, threshold }: { row: InventoryRow; threshold: number }) {
  if (isOutOfStock(row.stock)) return <span className="inline-flex rounded-full bg-tint-pink px-2 py-0.5 text-xs font-semibold text-primary">Agotado</span>;
  if (isLowStock(row.stock, threshold)) return <span className="inline-flex rounded-full bg-tint-cream px-2 py-0.5 text-xs font-semibold text-primary">{row.stock} und</span>;
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
  /** Umbral de stock crítico ya resuelto (`resolveLowStockThreshold`). */
  threshold: number;
  /** Si el umbral viene de Ajustes de la tienda o es el valor por defecto. */
  thresholdFromSettings?: boolean;
}

export function InventoryClient({ data, threshold, thresholdFromSettings = false }: InventoryClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);
  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<InventoryView>(isInventoryView(requested) ? requested : DEFAULT_VIEW);
  const [adjustOpen, setAdjustOpen] = useState(false);
  /** Producto preseleccionado en «Ajustar inventario» (desde una fila); null desde el encabezado. */
  const [adjustProductId, setAdjustProductId] = useState<string | null>(null);

  const totals = useMemo(() => summarizeInventory(data, threshold), [data, threshold]);
  const counts = useMemo(() => Object.fromEntries(INVENTORY_VIEWS.map((v) => [v.id, data.filter((row) => inventoryMatchesView(row, v.id, threshold)).length])) as Record<InventoryView, number>, [data, threshold]);
  const rows = useMemo(() => data.filter((row) => inventoryMatchesView(row, view, threshold)), [data, view, threshold]);

  const openAdjust = (productId: string | null) => {
    setAdjustProductId(productId);
    setAdjustOpen(true);
  };

  const setView = (next: InventoryView) => {
    setViewState(next);
    const query = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, next);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };

  const columns = useMemo<ColumnDef<InventoryRow>[]>(() => [
    {
      id: "product",
      accessorFn: (row) => [row.name, row.sku, row.categoryName].filter(Boolean).join(" "),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Producto" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          {row.original.image ? <Image src={row.original.image} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Package className="h-4 w-4" aria-hidden="true" /></span>}
          <div className="flex min-w-0 max-w-[280px] flex-col gap-0.5">
            <Link href={`/${storeId}/productos/${row.original.id}`} className="truncate font-semibold text-primary hover:underline" title={row.original.name}>{row.original.name}</Link>
            <span className="truncate text-xs text-muted-foreground">{row.original.sku}{row.original.categoryName ? ` · ${row.original.categoryName}` : ""}{row.original.isKit ? " · kit" : ""}</span>
          </div>
        </div>
      ),
    },
    { accessorKey: "stock", header: ({ column }) => <DataTableColumnHeader column={column} title="Stock" />, cell: ({ row }) => <StockCell row={row.original} threshold={threshold} />, enableGlobalFilter: false },
    { accessorKey: "acqPrice", header: ({ column }) => <DataTableColumnHeader column={column} title="Costo unit." />, cell: ({ row }) => (row.original.isKit ? <span className="text-xs text-muted-foreground">componentes</span> : Number(row.original.acqPrice) > 0 ? <DataTableCellCurrency value={Number(row.original.acqPrice)} /> : <span className="inline-flex rounded-full bg-tint-cream px-2 py-0.5 text-xs font-semibold text-primary">Sin costo</span>), enableGlobalFilter: false },
    { id: "value", accessorFn: (row) => inventoryRowValue(row).cost, header: ({ column }) => <DataTableColumnHeader column={column} title="Valor a costo" />, cell: ({ row }) => <DataTableCellCurrency value={inventoryRowValue(row.original).cost} />, enableGlobalFilter: false },
    { accessorKey: "price", header: ({ column }) => <DataTableColumnHeader column={column} title="Precio" />, cell: ({ row }) => <DataTableCellCurrency value={row.original.price} />, enableGlobalFilter: false },
    {
      id: "lastMovement",
      accessorFn: (row) => row.lastMovement?.at ?? row.updatedAt,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Último movimiento" />,
      cell: ({ row }) => row.original.lastMovement ? (
        <span className="text-xs text-muted-foreground" title={new Date(row.original.lastMovement.at).toLocaleString("es-CO")}>
          {MOVEMENT_LABEL[row.original.lastMovement.type] ?? row.original.lastMovement.type} {row.original.lastMovement.quantity > 0 ? "+" : ""}{row.original.lastMovement.quantity} · {formatDistanceToNowStrict(new Date(row.original.lastMovement.at), { addSuffix: true, locale: es })}
        </span>
      ) : <span className="text-xs text-muted-foreground">Sin movimientos</span>,
      enableGlobalFilter: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => (
        <div className="flex justify-end" data-no-row-click>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openAdjust(row.original.isKit ? null : row.original.id)}>Ajustar inventario</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(restockHref(storeId, row.original))}>Reponer con el proveedor{row.original.supplier ? ` (${row.original.supplier.name})` : ""}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${storeId}/movimientos-inventario?producto=${encodeURIComponent(row.original.id)}`)}>Ver movimientos</DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push(`/${storeId}/productos/${row.original.id}`)}>Abrir producto</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      enableGlobalFilter: false,
    },
  ], [router, storeId, threshold]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Inventario</h1>
          <p className="text-sm text-muted-foreground">Todo el stock activo en una lista, valorado al costo de compra registrado. Los kits se calculan desde sus componentes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => openAdjust(null)}><History className="h-4 w-4" aria-hidden="true" />Ajustar inventario</Button>
          <Button asChild><Link href={`/${storeId}/aprovisionamiento/nuevo`}><Package className="h-4 w-4" aria-hidden="true" />Nueva orden de aprovisionamiento</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Metric label="Valor a costo" value={currencyFormatter(totals.costValue)} note={`${totals.units.toLocaleString("es-CO")} unidades · a venta ${currencyFormatter(totals.retailValue)}`} icon={<Wallet className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-mint" />
        <Metric label="Productos activos" value={totals.products.toLocaleString("es-CO")} note="Sin archivados ni cápsulas" icon={<Boxes className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-sky" />
        <Metric label="Stock crítico" value={totals.lowStock.toLocaleString("es-CO")} note={`${describeLowStockThreshold(threshold, thresholdFromSettings)} · ${totals.outOfStock} agotados`} icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-pink" />
        <Metric label="Sin costo registrado" value={totals.withoutCost.toLocaleString("es-CO")} note="No entran en la valorización ni en el margen" icon={<Package className="h-4 w-4" aria-hidden="true" />} tint="bg-tint-cream" />
      </div>

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

      <DataTable
        tableKey={Models.Inventory}
        searchPlaceholder="Buscar por nombre, SKU o subcategoría…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/productos/${row.id}`)}
        emptyState={view === "todo" ? { title: "Aún no hay productos con stock" } : { title: "Nada en esta vista", description: view === "stock-critico" ? `Ningún producto tiene entre 1 y ${threshold} ${threshold === 1 ? "unidad" : "unidades"}.` : view === "agotados" ? "No hay productos agotados." : view === "sin-costo" ? "Todos los productos tienen costo de compra." : "No hay kits." }}
      />

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
