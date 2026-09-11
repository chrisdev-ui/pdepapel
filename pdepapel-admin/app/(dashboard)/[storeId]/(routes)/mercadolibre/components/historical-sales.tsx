"use client";

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Models } from "@/constants";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  countSalesByView,
  DEFAULT_SALES_VIEW,
  isSalesView,
  SALES_VIEWS,
  saleMatchesView,
  type SalesView,
} from "@/lib/mercadolibre/sales-views";
import { cn } from "@/lib/utils";

import { HistoricalImportCard } from "./sales/historical-import-card";
import { SaleMobileCard } from "./sales/sale-mobile-card";
import { getResponseError, type SaleFeedback, type SalesResponse } from "./sales/sale-types";
import { buildSalesColumns } from "./sales/sales-columns";
import { useSaleActions } from "./sales/use-sale-actions";

const VIEW_PARAM = "vista";

/**
 * Pestaña Ventas de Mercado Libre: primero lo que hay que atender hoy
 * (excepciones de inventario, retornos, liquidaciones), luego el resto de
 * ventas, y al final la herramienta para importar ventas anteriores a la
 * integración. Vistas en la URL como en Pedidos.
 */
export function MercadoLibreHistoricalSales({
  storeId,
  canReconcile,
  highlightedOrderId,
}: {
  storeId: string;
  canReconcile: boolean;
  highlightedOrderId: string | null;
}) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<SalesView>(
    isSalesView(requested) ? requested : DEFAULT_SALES_VIEW,
  );
  const [sales, setSales] = useState<SalesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SaleFeedback | null>(null);

  const loadSales = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const query = new URLSearchParams();
      if (highlightedOrderId) query.set("order", highlightedOrderId);
      const response = await fetch(
        `/api/${storeId}/marketplaces/mercadolibre/historical-sales?${query}`,
      );
      if (!response.ok) throw new Error(await getResponseError(response));
      setSales((await response.json()) as SalesResponse);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "No fue posible cargar las ventas",
      );
    } finally {
      setIsLoading(false);
    }
  }, [highlightedOrderId, storeId]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const onActionDone = useCallback(
    async (result: SaleFeedback) => {
      await loadSales();
      setFeedback(result);
    },
    [loadSales],
  );
  const { resync, confirmReturn, busySaleId, confirmationDialog } = useSaleActions({
    storeId,
    onDone: onActionDone,
  });

  const allSales = useMemo(() => sales?.data ?? [], [sales]);
  const counts = useMemo(() => countSalesByView(allSales), [allSales]);
  const rows = useMemo(
    () => allSales.filter((sale) => saleMatchesView(sale, view)),
    [allSales, view],
  );
  const columns = useMemo(
    () => buildSalesColumns({ busySaleId, onResync: resync, onConfirmReturn: confirmReturn }),
    [busySaleId, resync, confirmReturn],
  );
  const linkedSale = sales?.linkedSale ?? null;

  const setView = useCallback(
    (next: SalesView) => {
      setViewState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_SALES_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

  // Con la vista «Por atender» vacía se aterriza en «Todas»: nada que hacer no es una pantalla vacía.
  useEffect(() => {
    if (!isSalesView(requested) && sales && counts["por-atender"] === 0 && view === "por-atender") {
      setViewState("todas");
    }
  }, [counts, requested, sales, view]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-tight text-primary">Ventas de Mercado Libre</h2>
          <p className="text-sm text-muted-foreground">
            Cada venta pagada descuenta inventario una vez y registra el neto que Mercado Libre liquida.{" "}
            {sales ? `${sales.total} en total.` : ""}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadSales()} disabled={isLoading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} aria-hidden="true" />
          Actualizar
        </Button>
      </div>

      {linkedSale ? (
        <section
          aria-label="Venta enlazada"
          className="rounded-xl border border-tint-lavender bg-tint-lavender/20 p-3"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
            Venta enlazada desde el aviso
          </p>
          <SaleMobileCard
            sale={linkedSale}
            busySaleId={busySaleId}
            onResync={resync}
            onConfirmReturn={confirmReturn}
            highlighted
          />
        </section>
      ) : null}

      {feedback ? (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border p-3 text-sm",
            feedback.type === "error"
              ? "border-tint-pink bg-tint-pink/20 text-primary"
              : "border-tint-mint bg-tint-mint/30 text-primary",
          )}
          role={feedback.type === "error" ? "alert" : "status"}
        >
          {feedback.type === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <p className="flex-1">{feedback.message}</p>
          <button
            type="button"
            className="text-xs underline underline-offset-2"
            onClick={() => setFeedback(null)}
          >
            Cerrar
          </button>
        </div>
      ) : null}

      <div role="tablist" aria-label="Vistas de ventas" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
        {SALES_VIEWS.map((item) => {
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
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>
                {isLoading && !sales ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : counts[item.id]}
              </span>
            </button>
          );
        })}
      </div>

      <DataTable
        tableKey={Models.MarketplaceSales}
        searchPlaceholder="Buscar por número de venta, pack, comprador o producto…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        isLoading={isLoading && !sales}
        error={loadError}
        onRetry={() => void loadSales()}
        renderMobileCard={(row) => (
          <SaleMobileCard
            sale={row.original}
            busySaleId={busySaleId}
            onResync={resync}
            onConfirmReturn={confirmReturn}
            highlighted={row.original.id === highlightedOrderId}
          />
        )}
        emptyState={
          view === "todas"
            ? {
                title: "Aún no hay ventas de Mercado Libre",
                description: "Las ventas pagadas llegan solas por webhook. Una venta anterior a la integración se importa desde la tarjeta de abajo.",
              }
            : view === "por-atender"
              ? { title: "Todo al día", description: "No hay excepciones de inventario, retornos por confirmar ni liquidaciones pendientes." }
              : { title: "Nada en esta vista", description: "Cuando una venta entre en este estado aparecerá aquí." }
        }
      />

      <HistoricalImportCard
        storeId={storeId}
        canReconcile={canReconcile}
        onFeedback={setFeedback}
        onImported={loadSales}
      />
      {confirmationDialog}
    </div>
  );
}
