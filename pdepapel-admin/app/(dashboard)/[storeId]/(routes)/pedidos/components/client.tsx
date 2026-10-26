"use client";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Models } from "@/constants";
import { DEFAULT_ORDER_VIEW, ORDER_VIEWS, isOrderView, type OrderView } from "@/lib/order-queues";
import {
  ORDER_CHANNEL_FILTERS,
  ORDER_DATE_FILTERS,
  colombiaDay,
  hasActiveListFilters,
  parseOrderListFilters,
  writeOrderListFilters,
  type OrderListFilters,
} from "@/lib/order-list-filters";
import { cn } from "@/lib/utils";
import type { SortingState } from "@tanstack/react-table";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { OrderColumn, buildColumns } from "./columns";
import { OrderMobileCard } from "./order-mobile-card";

interface OrderClientProps {
  /** Solo la página actual: la lista se pagina, filtra y busca en el servidor. */
  data: OrderColumn[];
  counts: Record<OrderView, number>;
  /** Pedidos de la pestaña actual con estos filtros. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Todos los pedidos de la tienda, sin filtros. */
  totalOrders: number;
  search: string;
}

const VIEW_PARAM = "vista";
const PAGE_PARAM = "pagina";
const SEARCH_PARAM = "q";
const SORT_PARAM = "orden";
const SEARCH_DELAY_MS = 350;

const OrderClient: React.FC<OrderClientProps> = ({ data, counts, total, page, pageCount, pageSize, totalOrders, search }) => {
  const canWrite = useCanWrite();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);

  const [pending, startTransition] = useTransition();

  const requested = searchParams.get(VIEW_PARAM);
  const view: OrderView = isOrderView(requested) ? requested : DEFAULT_ORDER_VIEW;
  const filters = useMemo(() => parseOrderListFilters(new URLSearchParams(searchParams.toString())), [searchParams]);
  const columns = useMemo(() => buildColumns(storeId), [storeId]);

  // Las acciones masivas solo ven las filas de la página: al cambiar de página
  // o de lista se suelta la selección, para no dejar marcas que ya no cuentan.
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  /** Todo vive en la URL: el servidor arma la página con ella, y se puede compartir. */
  const navigate = useCallback(
    (change: (query: URLSearchParams) => void) => {
      setRowSelection({});
      const query = new URLSearchParams(window.location.search);
      change(query);
      const suffix = query.toString();
      startTransition(() => router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  const setView = useCallback(
    (next: OrderView) =>
      navigate((query) => {
        if (next === DEFAULT_ORDER_VIEW) query.delete(VIEW_PARAM);
        else query.set(VIEW_PARAM, next);
        query.delete(PAGE_PARAM);
      }),
    [navigate],
  );

  const setFilters = useCallback(
    (next: OrderListFilters) =>
      navigate((query) => {
        writeOrderListFilters(query, next);
        query.delete(PAGE_PARAM);
      }),
    [navigate],
  );

  const setPage = useCallback(
    (next: number) =>
      navigate((query) => {
        if (next <= 1) query.delete(PAGE_PARAM);
        else query.set(PAGE_PARAM, String(next));
      }),
    [navigate],
  );

  // El orden lo aplica el servidor a toda la lista: antes solo reordenaba los 25 pedidos de la página.
  const sortParam = searchParams.get(SORT_PARAM) ?? "";
  const sorting = useMemo<SortingState>(
    () => (sortParam ? [{ id: sortParam.replace(/^-/, ""), desc: sortParam.startsWith("-") }] : []),
    [sortParam],
  );
  const setSorting = useCallback(
    (next: SortingState) =>
      navigate((query) => {
        const [first] = next;
        if (first) query.set(SORT_PARAM, `${first.desc ? "-" : ""}${first.id}`);
        else query.delete(SORT_PARAM);
        query.delete(PAGE_PARAM);
      }),
    [navigate],
  );

  // La búsqueda espera a que se deje de escribir para no pedir una página por letra.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);
  const setSearch = useCallback(
    (value: string) => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(
        () =>
          navigate((query) => {
            const text = value.trim();
            if (text) query.set(SEARCH_PARAM, text);
            else query.delete(SEARCH_PARAM);
            query.delete(PAGE_PARAM);
          }),
        SEARCH_DELAY_MS,
      );
    },
    [navigate],
  );

  const today = colombiaDay();
  const filtering = hasActiveListFilters(filters);

  // Las pestañas de excepción solo aparecen cuando tienen pedidos (o están abiertas).
  const visibleViews = ORDER_VIEWS.filter(
    (item) => !(item.id === "con-novedad" || item.id === "sin-cuadrar") || counts[item.id] > 0 || view === item.id,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Tienda en línea, cotizaciones, personalizados, punto de venta y ferias en una sola lista. {totalOrders} en total.
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
        data={data}
        isLoading={pending}
        server={{ page, pageCount, total, pageSize, search, onSearchChange: setSearch, onPageChange: setPage, sorting, onSortingChange: setSorting }}
        getRowId={(row) => row.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
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
