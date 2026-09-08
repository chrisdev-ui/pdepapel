"use client";

import { MessageCircle } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import {
  CUSTOMER_VIEWS,
  DEFAULT_CUSTOMER_VIEW,
  SEGMENT_LABELS,
  customerMatchesView,
  isCustomerView,
  summarizeCustomers,
  type CustomerSegment,
  type CustomerView,
} from "@/lib/customer-views";
import { cn, currencyFormatter } from "@/lib/utils";

import { buildColumns, type CustomerColumn } from "./columns";
import { CustomerMobileCard } from "./customer-mobile-card";
import { ReactivationDialog, type ReactivationTarget } from "./reactivation-dialog";

interface CustomerClientProps {
  data: CustomerColumn[];
  storeName: string;
  storeUrl: string;
}

const VIEW_PARAM = "vista";

const EMPTY_COPY: Record<CustomerView, { title: string; description: string }> = {
  todos: { title: "Aún no hay clientes", description: "Cada pedido con teléfono crea o actualiza un cliente." },
  vip: { title: "Aún no hay clientes VIP", description: "El 10 % que más gasta entre quienes compraron en los últimos 90 días aparece aquí." },
  recurrentes: { title: "Nadie ha repetido todavía", description: "Quien compra más de una vez aparece aquí." },
  inactivos: { title: "Nadie inactivo", description: "Clientes sin compras en más de 90 días aparecen aquí para reactivarlos." },
  "sin-compra": { title: "Nadie sin compra", description: "Personas con pedidos pendientes o cancelados y ninguna compra pagada." },
};

export default function CustomerClient({ data, storeName, storeUrl }: CustomerClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);

  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<CustomerView>(isCustomerView(requested) ? requested : DEFAULT_CUSTOMER_VIEW);
  const [reactivating, setReactivating] = useState<ReactivationTarget[] | null>(null);

  const summary = useMemo(() => summarizeCustomers(data.map((customer) => customer.segment)), [data]);
  const counts = useMemo(() => {
    const result = {} as Record<CustomerView, number>;
    for (const { id } of CUSTOMER_VIEWS) result[id] = data.filter((customer) => customerMatchesView(customer.segment, id)).length;
    return result;
  }, [data]);
  const rows = useMemo(() => data.filter((customer) => customerMatchesView(customer.segment, view)), [data, view]);
  const columns = useMemo(() => buildColumns(storeId), [storeId]);
  const totalSpent = useMemo(() => data.reduce((sum, customer) => sum + customer.totalSpent, 0), [data]);

  const setView = useCallback(
    (next: CustomerView) => {
      setViewState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_CUSTOMER_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

  const metrics = [
    { label: "Clientes", value: String(summary.total), hint: `${summary.buyers} con compra` },
    { label: "VIP", value: String(summary.vip), hint: "10 % que más gasta" },
    { label: "Inactivos", value: String(summary.inactive), hint: "Más de 90 días sin comprar" },
    { label: "Gastado en total", value: currencyFormatter(totalSpent), hint: "Pedidos pagados" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{metric.value}</p>
            <p className="text-xs text-muted-foreground">{metric.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Segmentos de clientes" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
          {CUSTOMER_VIEWS.map((item) => {
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
        <div className="flex items-center gap-2">
          <RefreshButton />
          {view === "inactivos" && rows.length > 0 && (
            <Button type="button" onClick={() => setReactivating(rows)}>
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Reactivar {rows.length > 1 ? `a ${rows.length}` : ""} por WhatsApp
            </Button>
          )}
        </div>
      </div>

      <DataTable
        tableKey={Models.Customers}
        searchPlaceholder="Buscar nombre, teléfono, correo o ciudad…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/clientes/${row.id}`)}
        renderMobileCard={(row) => <CustomerMobileCard customer={row.original} storeId={storeId} />}
        filters={[
          {
            columnKey: "segment",
            title: "Segmento",
            options: (Object.keys(SEGMENT_LABELS) as CustomerSegment[]).map((segment) => ({ label: SEGMENT_LABELS[segment].label, value: segment })),
          },
        ]}
        bulkActions={(table) => {
          const selected = table.getFilteredSelectedRowModel().rows.map((row) => row.original);
          if (selected.length === 0) return null;
          return (
            <Button type="button" variant="ghost" size="sm" onClick={() => setReactivating(selected)}>
              <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Escribir por WhatsApp ({selected.length})
            </Button>
          );
        }}
        emptyState={EMPTY_COPY[view]}
      />

      <ReactivationDialog
        open={reactivating !== null}
        onOpenChange={(open) => !open && setReactivating(null)}
        customers={reactivating ?? []}
        storeName={storeName}
        storeUrl={storeUrl}
      />
    </div>
  );
}
