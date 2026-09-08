"use client";

import axios from "axios";
import { CalendarDays, MapPin, PartyPopper, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateField } from "@/components/ui/date-field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_FAIR_VIEW,
  FAIR_STATUS_BADGE,
  FAIR_VIEWS,
  fairMatchesView,
  getFairNextStep,
  isFairView,
  soldShare,
  type FairView,
} from "@/lib/fair-phases";
import { cn, currencyFormatter } from "@/lib/utils";
import type { FairEventStatus } from "@prisma/client";

import { TintBadge } from "../../pedidos/components/order-badges";

export type FairEventSummary = {
  id: string;
  name: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: FairEventStatus;
  totalAllocated: number;
  totalSold: number;
  salesTotal: number;
  capsules: number;
};

const VIEW_PARAM = "vista";
const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) return error.response?.data?.error || "No fue posible guardar la feria";
  return "No fue posible guardar la feria";
}

export function FairEventsClient({ data }: { data: FairEventSummary[] }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<FairView>(isFairView(requested) ? requested : DEFAULT_FAIR_VIEW);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const counts = useMemo(() => {
    const result = {} as Record<FairView, number>;
    for (const { id } of FAIR_VIEWS) result[id] = data.filter((fair) => fairMatchesView(fair.status, id)).length;
    return result;
  }, [data]);
  const rows = useMemo(() => data.filter((fair) => fairMatchesView(fair.status, view)), [data, view]);

  const setView = useCallback(
    (next: FairView) => {
      setViewState(next);
      const query = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_FAIR_VIEW) query.delete(VIEW_PARAM);
      else query.set(VIEW_PARAM, next);
      const suffix = query.toString();
      window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
    },
    [pathname, searchParams],
  );

  async function createFairEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") || "").trim();
    if (name.length < 3) {
      toast({ title: "Escribe un nombre para la feria", description: "Debe tener al menos 3 caracteres.", variant: "destructive" });
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
      toast({ title: "Feria creada", description: "Ahora reserva el inventario que vas a llevar.", variant: "success" });
      router.push(`/${storeId}/ferias/${response.data.id}`);
    } catch (error) {
      toast({ title: "No se pudo crear la feria", description: getErrorMessage(error), variant: "destructive" });
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
            Reserva el inventario que llevas, vende con el lector y concilia al volver. Cada venta queda como pedido pagado.
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreating(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nueva feria
        </Button>
      </div>

      <div role="tablist" aria-label="Vistas de ferias" className="flex max-w-full gap-1 overflow-x-auto self-start rounded-full border bg-white p-1">
        {FAIR_VIEWS.map((item) => {
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

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <PartyPopper className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="font-semibold">{view === "todas" ? "Aún no hay ferias" : view === "activas" ? "No hay ferias en curso" : "Aún no hay ferias cerradas"}</p>
              <p className="text-sm text-muted-foreground">Crea una antes de llevar productos a una venta presencial.</p>
            </div>
            {view !== "cerradas" && (
              <Button type="button" variant="soft" onClick={() => setIsCreating(true)}>
                Nueva feria
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((fair) => {
            const badge = FAIR_STATUS_BADGE[fair.status];
            const share = soldShare({ allocated: fair.totalAllocated, sold: fair.totalSold });
            const next = getFairNextStep({ status: fair.status, allocated: fair.totalAllocated, sold: fair.totalSold });
            const dates = [fair.startsAt, fair.endsAt].filter((value): value is string => Boolean(value)).map((value) => DATE.format(new Date(value)));
            return (
              <li key={fair.id}>
                <Card className="flex h-full flex-col">
                  <CardHeader className="gap-2 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg">
                        <Link href={`/${storeId}/ferias/${fair.id}`} className="text-primary underline-offset-4 hover:underline">
                          {fair.name}
                        </Link>
                      </CardTitle>
                      <TintBadge label={badge.label} tone={badge.tone} />
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {fair.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                          {fair.location}
                        </span>
                      )}
                      {dates.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                          {dates.join(" – ")}
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto flex flex-col gap-3">
                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-sm">
                      <div>
                        <p className="font-semibold tabular-nums">{fair.totalAllocated}</p>
                        <p className="text-xs text-muted-foreground">Reservadas</p>
                      </div>
                      <div>
                        <p className="font-semibold tabular-nums">{fair.totalSold}</p>
                        <p className="text-xs text-muted-foreground">Vendidas</p>
                      </div>
                      <div>
                        <p className="font-semibold tabular-nums">{currencyFormatter(fair.salesTotal)}</p>
                        <p className="text-xs text-muted-foreground">Ventas</p>
                      </div>
                    </div>
                    {fair.totalAllocated > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={share} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje vendido">
                          <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                        </span>
                        <span className="tabular-nums">{share}% vendido</span>
                        {fair.capsules > 0 && <span>· {fair.capsules} cápsulas</span>}
                      </div>
                    )}
                    <Button asChild variant={fair.status === "OPEN" ? "default" : "soft"} className="w-full">
                      <Link href={`/${storeId}/ferias/${fair.id}${next?.anchor ?? ""}`}>
                        {fair.status === "OPEN" ? "Registrar ventas" : next ? next.label : "Ver feria"}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={isCreating} onOpenChange={setIsCreating}>
        <DialogContent className="sm:max-w-lg">
          <form className="grid gap-4" onSubmit={createFairEvent}>
            <DialogHeader>
              <DialogTitle>Nueva feria</DialogTitle>
              <DialogDescription>
                Después de crearla reservas los productos que llevarás; esa cantidad deja de estar disponible en la tienda en línea.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="fair-name">Nombre</Label>
              <Input id="fair-name" name="name" placeholder="Ej. Comic Con Medellín" required autoFocus />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fair-location">Lugar</Label>
              <Input id="fair-location" name="location" placeholder="Ej. Plaza Mayor" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="fair-start">Inicio</Label>
                <DateField id="fair-start" name="startsAt" placeholder="Fecha de inicio" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fair-end">Fin</Label>
                <DateField id="fair-end" name="endsAt" placeholder="Fecha de finalización" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fair-notes">Notas</Label>
              <Textarea id="fair-notes" name="notes" placeholder="Información útil para el equipo." rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreating(false)} disabled={isSubmitting}>
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
