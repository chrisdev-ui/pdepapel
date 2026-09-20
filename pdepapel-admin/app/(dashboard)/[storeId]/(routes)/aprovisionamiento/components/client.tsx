"use client";

import { useMemo, useState } from "react";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { MetricCard } from "@/components/ui/metric-card";
import { RefreshButton } from "@/components/ui/refresh-button";
import { TintBadge } from "@/components/ui/tint-badge";
import { Models } from "@/constants";
import { formatKardexDay } from "@/lib/kardex";
import { RESTOCK_STATUS_LABELS, RESTOCK_STATUS_TONES } from "@/lib/restock-orders";
import {
  DEFAULT_RESTOCK_VIEW,
  expectedArrival,
  isRestockView,
  RESTOCK_VIEWS,
  restockMatchesView,
  summarizeRestockOrders,
  type RestockView,
} from "@/lib/restock-views";
import { cn, currencyFormatter } from "@/lib/utils";
import { RestockOrderStatus } from "@prisma/client";
import { Coins, Package, Plus, TriangleAlert, Truck, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";

import type { RestockOrderRow } from "../server/get-restock-orders";
import { CellAction } from "./cell-action";
import { columns, RestockProgressCell } from "./columns";

interface RestockOrderClientProps {
  data: RestockOrderRow[];
  supplierFilter?: { id: string; name: string } | null;
}

const STATUS_FILTER = {
  columnKey: "status",
  title: "Estado",
  options: (Object.keys(RESTOCK_STATUS_LABELS) as RestockOrderStatus[]).map((status) => ({
    label: RESTOCK_STATUS_LABELS[status],
    value: status,
  })),
};

const VIEW_PARAM = "vista";
const numberFormatter = new Intl.NumberFormat("es-CO");

export const RestockOrderClient: React.FC<RestockOrderClientProps> = ({ data, supplierFilter = null }) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const storeId = String(params.storeId);
  const canWrite = useCanWrite();

  // La URL manda; el estado local solo cubre el hueco hasta que Next refleja
  // el replaceState. Mismo patrón que Productos, Pedidos y Movimientos.
  const requested = searchParams.get(VIEW_PARAM);
  const requestedView: RestockView = isRestockView(requested) ? requested : DEFAULT_RESTOCK_VIEW;
  const [selected, setSelected] = useState<{ base: RestockView; view: RestockView } | null>(null);
  const view = selected?.base === requestedView ? selected.view : requestedView;

  const setView = (next: RestockView) => {
    setSelected({ base: requestedView, view: next });
    const query = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_RESTOCK_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, next);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };

  const totals = useMemo(() => summarizeRestockOrders(data), [data]);
  const rows = useMemo(() => data.filter((row) => restockMatchesView(row, view)), [data, view]);
  const overdueFirst = useMemo(() => data.find((row) => expectedArrival(row).state === "retrasado") ?? null, [data]);

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Aprovisionamiento</h1>
          <p className="text-sm text-muted-foreground">Lo que le pediste a cada proveedor y lo que ya llegó.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          {canWrite && (
            <Button asChild>
              <Link href={`/${storeId}/aprovisionamiento/nuevo`}>
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Crear pedido
              </Link>
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Esperando mercancía"
          value={numberFormatter.format(totals.waiting)}
          note="Pedidos hechos que aún no llegan"
          icon={<Truck className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-sky"
        />
        <MetricCard
          label="Unidades en camino"
          value={numberFormatter.format(totals.unitsInTransit)}
          note="Ya cuentan para «Por reponer»"
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-lavender"
        />
        <MetricCard
          label="Comprometido a costo"
          value={currencyFormatter(totals.committed)}
          note="Mercancía más envío de lo abierto"
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
        />
        <MetricCard
          label="Con retraso"
          value={numberFormatter.format(totals.overdue)}
          note={totals.overdue > 0 ? "Pasó el plazo del proveedor" : "Nada pasado de plazo"}
          icon={<TriangleAlert className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-pink"
          tone={totals.overdue > 0 ? "care" : "default"}
          action={
            overdueFirst ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/${storeId}/aprovisionamiento/${overdueFirst.id}`}>Ver {overdueFirst.orderNumber}</Link>
              </Button>
            ) : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Vistas de aprovisionamiento" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
          {RESTOCK_VIEWS.map((item) => {
            const active = item.id === view;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(item.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
                )}
              >
                {item.label}
                <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{totals.byView[item.id]}</span>
              </button>
            );
          })}
        </div>
        <span className="text-sm text-muted-foreground">
          {numberFormatter.format(data.length)} {data.length === 1 ? "pedido" : "pedidos"}
          {data.length > 0 ? ` desde ${formatKardexDay(data[data.length - 1].createdAt)}` : ""}
        </span>
      </div>

      {supplierFilter && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mostrando solo los pedidos de</span>
          <TintBadge label={supplierFilter.name} tone="lavender" />
          <Button asChild variant="ghost" size="xs">
            <Link href={`/${storeId}/aprovisionamiento`}>
              <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Quitar filtro
            </Link>
          </Button>
        </div>
      )}
      <DataTable
        tableKey={Models.RestockOrders}
        searchPlaceholder="Buscar por número, proveedor o estado…"
        columns={columns}
        data={rows}
        filters={[STATUS_FILTER]}
        onRowClick={(row) => router.push(`/${storeId}/aprovisionamiento/${row.id}`)}
        emptyState={{
          title: "Todavía no hay pedidos de aprovisionamiento",
          description: "Registra lo que le pides a un proveedor y recibe la mercancía desde aquí para que el stock y los costos queden al día.",
          action: (
            <Button asChild>
              <Link href={`/${storeId}/aprovisionamiento/nuevo`}>Crear el primer pedido</Link>
            </Button>
          ),
        }}
        renderMobileCard={(row) => {
          const order = row.original;
          return (
            <div className="flex flex-col gap-2 rounded-xl border bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="font-mono text-sm font-semibold text-primary">{order.orderNumber}</span>
                  <span className="truncate text-sm">{order.supplier.name}</span>
                </div>
                <CellAction data={order} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TintBadge label={RESTOCK_STATUS_LABELS[order.status]} tone={RESTOCK_STATUS_TONES[order.status]} />
                <span className="text-sm font-medium">{currencyFormatter(order.total)}</span>
              </div>
              <RestockProgressCell progress={order.progress} />
            </div>
          );
        }}
      />
    </>
  );
};

export default RestockOrderClient;
