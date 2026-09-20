"use client";

import axios from "axios";
import {
  CalendarDays,
  ClipboardCheck,
  FileSpreadsheet,
  MapPin,
  PartyPopper,
  Plus,
  Boxes,
  Store,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DataTableCellCurrency } from "@/components/ui/data-table-cell-currency";
import { DataTableColumnHeader } from "@/components/ui/data-table-column-header";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/ui/metric-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Textarea } from "@/components/ui/textarea";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import {
  FAIR_STATUS_BADGE,
  FAIR_VIEWS,
  getFairNextStep,
  soldShare,
  type FairView,
} from "@/lib/fair-phases";
import { cn, currencyFormatter } from "@/lib/utils";

import { TintBadge } from "../../pedidos/components/order-badges";
import type {
  FairEventSummary,
  FairMetrics,
  FairViewCounts,
} from "../server/get-fair-events";

export type { FairEventSummary };

const VIEW_PARAM = "vista";
const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) return error.response?.data?.error || "No fue posible guardar la feria";
  return "No fue posible guardar la feria";
}

const fairDates = (fair: FairEventSummary) =>
  [fair.startsAt, fair.endsAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => DATE.format(new Date(value)))
    .join(" – ");

interface FairEventsClientProps {
  data: FairEventSummary[];
  view: FairView;
  counts: FairViewCounts;
  metrics: FairMetrics;
}

export function FairEventsClient({ data, view, counts, metrics }: FairEventsClientProps) {
  // Crear una feria escribe: una cuenta de solo lectura no lo ve.
  const canWrite = useCanWrite();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // La vista la resuelve el servidor: cambiar de pestaña vuelve a consultar
  // con el filtro puesto, en vez de traerlo todo y esconder la mitad.
  const hrefForView = (next: FairView) =>
    next === "activas" ? pathname : `${pathname}?${VIEW_PARAM}=${next}`;

  const columns = useMemo(
    () => [
      {
        id: "fair",
        accessorFn: (row: FairEventSummary) => `${row.name} ${row.location ?? ""}`,
        header: ({ column }: any) => <DataTableColumnHeader column={column} title="Feria" />,
        cell: ({ row }: any) => {
          const fair = row.original as FairEventSummary;
          return (
            <div className="flex min-w-0 flex-col gap-0.5">
              <Link
                href={`/${storeId}/ferias/${fair.id}`}
                className="truncate font-semibold text-primary underline-offset-4 hover:underline"
              >
                {fair.name}
              </Link>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {fair.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                    {fair.location}
                  </span>
                ) : null}
                {fairDates(fair) ? (
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    {fairDates(fair)}
                  </span>
                ) : null}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: ({ column }: any) => <DataTableColumnHeader column={column} title="Estado" />,
        cell: ({ row }: any) => {
          const badge = FAIR_STATUS_BADGE[(row.original as FairEventSummary).status];
          return <TintBadge label={badge.label} tone={badge.tone} />;
        },
        enableGlobalFilter: false,
      },
      {
        id: "progress",
        accessorFn: (row: FairEventSummary) => soldShare({ allocated: row.totalAllocated, sold: row.totalSold }),
        header: ({ column }: any) => <DataTableColumnHeader column={column} title="Vendido" />,
        cell: ({ row }: any) => {
          const fair = row.original as FairEventSummary;
          if (fair.totalAllocated === 0) {
            return <span className="text-xs text-muted-foreground">Sin reservar</span>;
          }
          const share = soldShare({ allocated: fair.totalAllocated, sold: fair.totalSold });
          return (
            <div className="flex min-w-[140px] flex-col gap-1.5">
              <span className="text-xs font-semibold text-primary tabular-nums">
                {fair.totalSold} de {fair.totalAllocated}
              </span>
              <ProgressBar percent={share} barClassName="bg-primary" />
            </div>
          );
        },
        enableGlobalFilter: false,
      },
      {
        accessorKey: "salesTotal",
        header: ({ column }: any) => <DataTableColumnHeader column={column} title="Recaudado" />,
        cell: ({ row }: any) => <DataTableCellCurrency value={(row.original as FairEventSummary).salesTotal} />,
        enableGlobalFilter: false,
      },
      {
        accessorKey: "capsules",
        header: ({ column }: any) => <DataTableColumnHeader column={column} title="Cápsulas" />,
        cell: ({ row }: any) => {
          const capsules = (row.original as FairEventSummary).capsules;
          return capsules > 0 ? (
            <span className="text-sm tabular-nums text-primary">{capsules}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
        enableGlobalFilter: false,
      },
      {
        id: "actions",
        cell: ({ row }: any) => {
          const fair = row.original as FairEventSummary;
          const next = getFairNextStep({
            status: fair.status,
            allocated: fair.totalAllocated,
            sold: fair.totalSold,
          });
          return (
            <Button asChild size="sm" variant={fair.status === "OPEN" ? "default" : "soft"}>
              <Link href={`/${storeId}/ferias/${fair.id}${next?.anchor ?? ""}`}>
                {fair.status === "OPEN" ? "Registrar ventas" : next ? next.label : "Ver feria"}
              </Link>
            </Button>
          );
        },
        enableSorting: false,
        enableHiding: false,
        enableGlobalFilter: false,
      },
    ],
    [storeId],
  );

  /** En el teléfono la fila se lee como tarjeta, igual que en el lienzo. */
  const renderMobileCard = (row: any) => {
    const fair = row.original as FairEventSummary;
    const badge = FAIR_STATUS_BADGE[fair.status];
    const share = soldShare({ allocated: fair.totalAllocated, sold: fair.totalSold });
    const next = getFairNextStep({
      status: fair.status,
      allocated: fair.totalAllocated,
      sold: fair.totalSold,
    });
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link href={`/${storeId}/ferias/${fair.id}`} className="truncate font-semibold text-primary">
              {fair.name}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {[fair.location, fairDates(fair)].filter(Boolean).join(" · ")}
            </span>
          </div>
          <TintBadge label={badge.label} tone={badge.tone} />
        </div>

        {fair.totalAllocated > 0 ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted-foreground">Vendido</span>
              <span className="font-semibold text-primary tabular-nums">
                {fair.totalSold} de {fair.totalAllocated}
              </span>
            </div>
            <ProgressBar percent={share} barClassName="bg-primary" />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Todavía no has reservado stock para esta feria.</p>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
          <span className="text-muted-foreground">
            Recaudado{" "}
            <strong className="text-primary tabular-nums">{currencyFormatter(fair.salesTotal)}</strong>
          </span>
          {fair.capsules > 0 ? (
            <span className="text-muted-foreground">
              Cápsulas <strong className="text-primary tabular-nums">{fair.capsules}</strong>
            </span>
          ) : null}
        </div>

        <Button asChild variant={fair.status === "OPEN" ? "default" : "soft"} className="w-full">
          <Link href={`/${storeId}/ferias/${fair.id}${next?.anchor ?? ""}`}>
            {fair.status === "OPEN" ? "Registrar ventas" : next ? next.label : "Ver feria"}
          </Link>
        </Button>
      </div>
    );
  };

  async function createFairEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    if (name.length < 3) {
      toast({
        title: "Escribe un nombre para la feria",
        description: "Debe tener al menos 3 caracteres.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await axios.post(`/api/${storeId}/fair-events`, {
        name,
        location: String(formData.get("location") || "").trim(),
        startsAt: formData.get("startsAt") || undefined,
        endsAt: formData.get("endsAt") || undefined,
        notes: String(formData.get("notes") || "").trim(),
      });
      toast({
        title: "Feria creada",
        description: "Ahora reserva el inventario que vas a llevar.",
        variant: "success",
      });
      router.push(`/${storeId}/ferias/${response.data.id}`);
    } catch (error) {
      toast({
        title: "No se pudo crear la feria",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Ferias</h1>
          <p className="text-sm text-muted-foreground">
            Reserva el inventario que llevas, vende con el lector y concilia al volver. Cada venta
            queda como pedido pagado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild type="button" variant="outline">
            <Link href={`/${storeId}/movimientos-inventario?feria=`}>
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
              Conciliar feria anterior
            </Link>
          </Button>
          <Button type="button" disabled={!canWrite} onClick={() => setIsCreating(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nueva feria
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <MetricCard
          label="Ferias abiertas"
          value={metrics.openFairs.toLocaleString("es-CO")}
          note="Vendiendo en el puesto ahora mismo"
          icon={<Store className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
        />
        <MetricCard
          label="Unidades fuera de bodega"
          value={metrics.unitsOut.toLocaleString("es-CO")}
          note="Reservadas y sin vender en ferias sin cerrar"
          icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-sky"
        />
        <MetricCard
          label="Recaudado en ferias"
          value={currencyFormatter(metrics.soldValue)}
          note="De las ferias que siguen abiertas"
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-lavender"
        />
        <MetricCard
          label="Esperan conciliación"
          value={metrics.awaitingReconciliation.toLocaleString("es-CO")}
          note="Hay que contar lo que volvió para cerrarlas"
          icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
          tone={metrics.awaitingReconciliation > 0 ? "care" : "default"}
        />
      </div>

      <div
        role="tablist"
        aria-label="Vistas de ferias"
        className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border bg-white p-1"
      >
        {FAIR_VIEWS.map((item) => {
          const active = item.id === view;
          return (
            <Link
              key={item.id}
              role="tab"
              aria-selected={active}
              href={hrefForView(item.id)}
              scroll={false}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-primary text-primary-foreground" : "text-primary hover:bg-accent",
              )}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-muted")}>
                {counts[item.id]}
              </span>
            </Link>
          );
        })}
      </div>

      {data.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PartyPopper className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-semibold">
                {view === "todas"
                  ? "Aún no hay ferias"
                  : view === "activas"
                    ? "No hay ferias en curso"
                    : "Aún no hay ferias cerradas"}
              </p>
              <p className="text-sm text-muted-foreground">
                Crea una antes de llevar productos a una venta presencial.
              </p>
            </div>
            {view !== "cerradas" && (
              <Button type="button" variant="soft" disabled={!canWrite} onClick={() => setIsCreating(true)}>
                Nueva feria
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <DataTable
          tableKey={Models.FairEvents}
          columns={columns as any}
          data={data}
          searchKey="fair"
          searchPlaceholder="Busca una feria por nombre o lugar…"
          getRowId={(row) => row.id}
          renderMobileCard={renderMobileCard}
          emptyState={{ title: "Nada en esta vista" }}
        />
      )}

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={createFairEvent} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Nueva feria</DialogTitle>
              <DialogDescription>
                Con el nombre basta para empezar; el inventario se reserva después.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" name="name" placeholder="Mercado de las Pulgas" required minLength={3} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="location">Lugar</Label>
                <Input id="location" name="location" placeholder="Usaquén, Bogotá" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="startsAt">Empieza</Label>
                  <DateField id="startsAt" name="startsAt" presets={false} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="endsAt">Termina</Label>
                  <DateField id="endsAt" name="endsAt" presets={false} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Textarea id="notes" name="notes" rows={3} placeholder="Puesto, horarios, quién acompaña…" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)}>
                Cancelar
              </Button>
              <Button type="submit" isLoading={isSubmitting}>
                Crear feria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
