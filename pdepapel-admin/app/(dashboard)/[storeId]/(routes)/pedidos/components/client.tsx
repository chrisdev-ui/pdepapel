"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import {
  DEFAULT_ORDER_VIEW,
  ORDER_VIEWS,
  getOrderQueue,
  isOrderView,
  orderMatchesView,
  type OrderView,
} from "@/lib/order-queues";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
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
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);

  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<OrderView>(isOrderView(requested) ? requested : DEFAULT_ORDER_VIEW);

  const queued = useMemo(() => data.map((order) => ({ order, queue: getOrderQueue(order) })), [data]);
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
      setViewState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_ORDER_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      // La URL cambia al instante (sin volver a cargar la página) para que se pueda compartir o abrir desde la barra de comando.
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

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
          <Button asChild>
            <Link href={`/${storeId}/pedidos/nuevo`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo pedido
            </Link>
          </Button>
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

      <DataTable
        tableKey={Models.Orders}
        searchPlaceholder="Buscar pedido, cliente, teléfono o producto…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/pedidos/${row.id}`)}
        renderMobileCard={(row) => <OrderMobileCard order={row.original} storeId={storeId} />}
        emptyState={
          view === "todos"
            ? { title: "Aún no hay pedidos", description: "Crea el primero o registra una venta presencial.", action: <Button asChild><Link href={`/${storeId}/pedidos/nuevo`}>Nuevo pedido</Link></Button> }
            : { title: view === "por-atender" ? "Todo al día" : "Nada en esta cola", description: view === "por-atender" ? "No hay pagos por verificar, guías por crear ni novedades." : "Cuando un pedido entre en este estado aparecerá aquí." }
        }
      />
    </div>
  );
};

export default OrderClient;
