"use client";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Models } from "@/constants";
import {
  DEFAULT_ORDER_VIEW,
  ORDER_VIEWS,
  getOrderQueue,
  isOrderView,
  orderMatchesView,
  type OrderView,
} from "@/lib/order-queues";
import {
  ORDER_CHANNEL_FILTERS,
  ORDER_DATE_FILTERS,
  colombiaDay,
  hasActiveListFilters,
  orderMatchesListFilters,
  parseOrderListFilters,
  writeOrderListFilters,
  type OrderListFilters,
} from "@/lib/order-list-filters";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { OrderColumn, buildColumns } from "./columns";
import { OrderMobileCard } from "./order-mobile-card";

interface OrderClientProps {
  data: OrderColumn[];
}

const VIEW_PARAM = "vista";

const OrderClient: React.FC<OrderClientProps> = ({ data }) => {
  const canWrite = useCanWrite();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);

  const requested = searchParams.get(VIEW_PARAM);
  // La URL manda; el estado local solo cubre el hueco hasta que Next
  // refleja el replaceState.
  const requestedView: OrderView = isOrderView(requested) ? requested : DEFAULT_ORDER_VIEW;
  const [selected, setSelected] = useState<{ base: OrderView; view: OrderView } | null>(null);
  const view = selected?.base === requestedView ? selected.view : requestedView;

  const urlFilters = useMemo(() => parseOrderListFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const [localFilters, setLocalFilters] = useState<{ base: string; filters: OrderListFilters } | null>(null);
  const filterKey = searchParams.toString();
  const filters = localFilters?.base === filterKey ? localFilters.filters : urlFilters;
  const filtered = useMemo(() => data.filter((order) => orderMatchesListFilters(order, filters)), [data, filters]);

  const queued = useMemo(() => filtered.map((order) => ({ order, queue: getOrderQueue(order) })), [filtered]);
  const counts = useMemo(() => {
    const result = {} as Record<OrderView, number>;
    for (const { id } of ORDER_VIEWS) {
      result[id] = queued.filter(({ order, queue }) => orderMatchesView(queue, id, order)).length;
    }
    return result;
  }, [queued]);
  const rows = useMemo(
    () => queued.filter(({ order, queue }) => orderMatchesView(queue, view, order)).map(({ order }) => order),
    [queued, view],
  );
  const columns = useMemo(() => buildColumns(storeId), [storeId]);

  const setView = useCallback(
    (next: OrderView) => {
      setSelected({ base: requestedView, view: next });
      const query = new URLSearchParams(window.location.search);
      if (next === DEFAULT_ORDER_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      // La URL cambia al instante (sin volver a cargar la página) para que se pueda compartir o abrir desde la barra de comando.
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, requestedView],
  );

  const setFilters = useCallback(
    (next: OrderListFilters) => {
      setLocalFilters({ base: filterKey, filters: next });
      const query = new URLSearchParams(window.location.search);
      writeOrderListFilters(query, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [filterKey, pathname],
  );
  const today = colombiaDay();
  const filtering = hasActiveListFilters(filters);

  const visibleViews = ORDER_VIEWS.filter((item) => item.id !== "con-novedad" || counts["con-novedad"] > 0 || view === "con-novedad");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Tienda en línea, cotizaciones, personalizados, punto de venta y ferias en una sola lista. {data.length} en total.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RefreshButton />
          {canWrite && (
          <Button asChild>
            <Link href={`/${storeId}/pedidos/nuevo`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo pedido
            </Link>
          </Button>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Colas de pedidos" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
        {visibleViews.map((item) => {
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
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>{counts[item.id]}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center" aria-label="Filtrar pedidos">
        <Select
          value={filters.channel ?? "todos"}
          onValueChange={(value) => setFilters({ ...filters, channel: value === "todos" ? null : (value as OrderListFilters["channel"]) })}
        >
          <SelectTrigger className="h-9 w-full rounded-full bg-white lg:w-60" aria-label="Canal">
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los canales</SelectItem>
            {ORDER_CHANNEL_FILTERS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div role="radiogroup" aria-label="Fecha del pedido" className="flex max-w-full flex-wrap gap-1 rounded-2xl border bg-white p-1 lg:rounded-full">
          {ORDER_DATE_FILTERS.map((option) => {
            const active = filters.date.kind === option.kind;
            return (
              <button
                key={option.kind}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  setFilters({
                    ...filters,
                    date: option.kind === "rango" ? { kind: "rango", from: today, to: today } : { kind: option.kind } as OrderListFilters["date"],
                  })
                }
                className={cn(
                  "h-7 shrink-0 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {filters.date.kind === "rango" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Desde
              <Input
                type="date"
                className="h-9 w-40 bg-white"
                max={today}
                value={filters.date.from}
                onChange={(event) => event.target.value && filters.date.kind === "rango" && setFilters({ ...filters, date: { ...filters.date, from: event.target.value } })}
              />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              Hasta
              <Input
                type="date"
                className="h-9 w-40 bg-white"
                max={today}
                value={filters.date.to}
                onChange={(event) => event.target.value && filters.date.kind === "rango" && setFilters({ ...filters, date: { ...filters.date, to: event.target.value } })}
              />
            </label>
          </div>
        )}
        {filtering && (
          <Button variant="ghost" size="sm" className="self-start lg:self-auto" onClick={() => setFilters({ channel: null, date: { kind: "todas" } })}>
            <X className="h-4 w-4" aria-hidden="true" />
            Quitar filtros
          </Button>
        )}
      </div>

      <DataTable
        tableKey={Models.Orders}
        searchPlaceholder="Buscar pedido, cliente, teléfono o producto…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/pedidos/${row.id}`)}
        renderMobileCard={(row) => <OrderMobileCard order={row.original} storeId={storeId} />}
        emptyState={
          filtering && view !== "todos" && counts.todos > 0
            ? {
                title: "Nada en esta cola con estos filtros",
                description: `Hay ${counts.todos} pedido${counts.todos === 1 ? "" : "s"} con estos filtros en otras pestañas.`,
                action: <Button onClick={() => setView("todos")}>Ver en «Todos» ({counts.todos})</Button>,
              }
            : filtering
            ? {
                title: "Ningún pedido con estos filtros",
                description: "Prueba con otra fecha o con todos los canales.",
                action: <Button variant="outline" onClick={() => setFilters({ channel: null, date: { kind: "todas" } })}>Quitar filtros</Button>,
              }
            : view === "todos"
            ? { title: "Aún no hay pedidos", description: "Crea el primero o registra una venta presencial.", action: <Button asChild><Link href={`/${storeId}/pedidos/nuevo`}>Nuevo pedido</Link></Button> }
            : { title: view === "por-atender" ? "Todo al día" : "Nada en esta cola", description: view === "por-atender" ? "No hay pagos por verificar, guías por crear ni novedades." : "Cuando un pedido entre en este estado aparecerá aquí." }
        }
      />
    </div>
  );
};

export default OrderClient;
