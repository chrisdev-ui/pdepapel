"use client";

import { Download, Edit, MoreHorizontal, RefreshCw } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_SHIPMENT_VIEW,
  SHIPMENT_VIEWS,
  countShipmentViews,
  isShipmentView,
  isStaleDispatch,
  shipmentMatchesView,
  type ShipmentView,
} from "@/lib/shipment-views";
import { cn } from "@/lib/utils";
import { ShippingProvider } from "@prisma/client";

import type { DispatchShipment } from "../server/get-shipments";
import { BulkActions } from "./bulk-actions";
import { BulkManualUpdateModal } from "./bulk-manual-update-modal";
import { buildColumns, carrierLabel, PROVIDER_LABELS, type ShipmentColumn } from "./columns";
import { PickingListButton } from "./picking-list";
import { ShipmentMobileCard } from "./shipment-mobile-card";

interface ShipmentsClientProps {
  data: ShipmentColumn[];
  dispatch: DispatchShipment[];
}

const VIEW_PARAM = "vista";

const EMPTY_COPY: Record<ShipmentView, { title: string; description: string }> = {
  "por-despachar": { title: "Nada por despachar", description: "Cuando un pedido pagado o contra entrega quede listo, aparecerá aquí con su lista de recogida." },
  "despachados-hoy": { title: "Hoy no ha salido ningún paquete", description: "Los envíos que salgan hoy se listan aquí con su guía." },
  "en-camino": { title: "Nada en camino", description: "Los envíos despachados aparecen aquí hasta que se entregan." },
  "con-novedad": { title: "Sin novedades", description: "Entregas fallidas, devoluciones e incidencias aparecen aquí para responderlas." },
  entregados: { title: "Aún no hay entregas", description: "Los envíos entregados quedan aquí como historial." },
  todos: { title: "Aún no hay envíos", description: "Cada pedido con envío a domicilio crea uno al pagarse." },
};

export default function ShipmentsClient({ data, dispatch }: ShipmentsClientProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);
  const { toast } = useToast();

  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<ShipmentView>(isShipmentView(requested) ? requested : DEFAULT_SHIPMENT_VIEW);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openManualModal, setOpenManualModal] = useState(false);

  const counts = useMemo(() => countShipmentViews(data), [data]);
  const rows = useMemo(() => data.filter((shipment) => shipmentMatchesView(shipment, view)), [data, view]);
  const staleCount = useMemo(() => data.filter((shipment) => isStaleDispatch(shipment)).length, [data]);
  const columns = useMemo(() => buildColumns(storeId), [storeId]);
  const carrierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const shipment of data) {
      const label = carrierLabel(shipment);
      if (label) names.add(label);
    }
    return Array.from(names).sort().map((name) => ({ label: name, value: name }));
  }, [data]);

  const setView = useCallback(
    (next: ShipmentView) => {
      setViewState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_SHIPMENT_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch(`/api/${storeId}/${Models.Shipments}/export`);
      if (!response.ok) throw new Error("Error al exportar");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `envios-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast({ title: "Exportación lista", description: "El archivo CSV se descargó." });
    } catch {
      toast({ title: "No se pudo exportar", description: "Inténtalo de nuevo.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const onSync = async () => {
    try {
      setSyncing(true);
      const response = await fetch(`/api/${storeId}/${Models.Shipments}/sync`, { method: "POST" });
      if (!response.ok) throw new Error("Sync failed");
      const result = await response.json();
      toast({ title: "Sincronización completada", description: `Se actualizaron ${result.updated} envíos de EnvioClick.` });
      router.refresh();
    } catch {
      toast({ title: "No se pudo sincronizar", description: "EnvioClick no respondió. Inténtalo más tarde.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const visibleViews = SHIPMENT_VIEWS.filter((item) => item.id !== "con-novedad" || counts["con-novedad"] > 0 || view === "con-novedad");
  const empty = EMPTY_COPY[view];

  return (
    <div className="flex flex-col gap-4">
      <BulkManualUpdateModal isOpen={openManualModal} onClose={() => setOpenManualModal(false)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Envíos</h1>
          <p className="text-sm text-muted-foreground">
            Qué falta despachar, qué salió hoy y qué tiene novedad. El detalle de cada envío vive en su pedido. {data.length} en total.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Más acciones">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={onSync} disabled={syncing}>
                <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} aria-hidden="true" />
                Sincronizar con EnvioClick
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setOpenManualModal(true)}>
                <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                Corregir envíos manuales…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport} disabled={exporting || data.length === 0}>
                <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                {exporting ? "Exportando…" : "Exportar CSV"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PickingListButton shipments={dispatch} selectedIds={rows.map((row) => row.id)} />
        </div>
      </div>

      <div role="tablist" aria-label="Vistas de envíos" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
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

      {view === "por-despachar" && staleCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {staleCount} envío{staleCount === 1 ? "" : "s"} más antiguo{staleCount === 1 ? "" : "s"} sigue{staleCount === 1 ? "" : "n"} en «Preparando» y no entra{staleCount === 1 ? "" : "n"} en el despacho del día.{" "}
          <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setView("todos")}>
            Verlos en Todos
          </button>
          .
        </p>
      )}

      <DataTable
        tableKey={Models.Shipments}
        searchPlaceholder="Buscar pedido, cliente, ciudad o guía…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => {
          if (row.order) router.push(`/${storeId}/pedidos/${row.order.id}#envio`);
        }}
        renderMobileCard={(row) => <ShipmentMobileCard shipment={row.original} storeId={storeId} />}
        filters={[
          { columnKey: "carrier", title: "Transportadora", options: carrierOptions },
          {
            columnKey: "provider",
            title: "Origen de la guía",
            options: Object.values(ShippingProvider).map((provider) => ({ label: PROVIDER_LABELS[provider], value: provider })),
          },
        ]}
        bulkActions={(table) => <BulkActions table={table} dispatch={dispatch} />}
        emptyState={empty}
      />
    </div>
  );
}
