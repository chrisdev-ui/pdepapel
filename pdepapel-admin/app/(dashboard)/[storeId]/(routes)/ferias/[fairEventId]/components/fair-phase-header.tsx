"use client";

import { CalendarDays, Check, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { FairEventStatus } from "@prisma/client";
import { FAIR_PHASES, FAIR_STATUS_BADGE, getFairNextStep, getFairPhase, getPhaseIndex } from "@/lib/fair-phases";
import { cn } from "@/lib/utils";

import { TintBadge } from "../../../pedidos/components/order-badges";

const DATE = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeZone: "America/Bogota" });

interface FairPhaseHeaderProps {
  storeId: string;
  name: string;
  status: FairEventStatus;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allocated: number;
  sold: number;
  /** Acción principal de la fase (por ejemplo «Abrir para ventas»). */
  action?: ReactNode;
}

/**
 * Cabecera del espacio de trabajo de una feria: nombre, estado, fechas,
 * el recorrido Preparar › Vender › Conciliar › Cerrada y el siguiente paso.
 */
export function FairPhaseHeader({ storeId, name, status, location, startsAt, endsAt, allocated, sold, action }: FairPhaseHeaderProps) {
  const phase = getFairPhase(status);
  const index = getPhaseIndex(phase);
  const badge = FAIR_STATUS_BADGE[status];
  const next = getFairNextStep({ status, allocated, sold });
  const dates = [startsAt, endsAt]
    .filter((value): value is string => Boolean(value))
    .map((value) => DATE.format(new Date(value)));

  return (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">{name}</h1>
            <TintBadge label={badge.label} tone={badge.tone} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {location}
              </span>
            )}
            {dates.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                {dates.join(" – ")}
              </span>
            )}
            <Link href={`/${storeId}/ferias`} className="font-medium text-primary underline-offset-4 hover:underline">
              Todas las ferias
            </Link>
          </div>
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>

      {status !== "CANCELLED" && (
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Recorrido de la feria">
          {FAIR_PHASES.map((item, position) => {
            const done = position < index;
            const current = position === index;
            const href = item.id === "preparar" ? "#inventario" : item.id === "vender" ? "#ventas" : item.id === "conciliar" ? "#cierre" : undefined;
            const content = (
              <>
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    done ? "bg-primary text-primary-foreground" : current ? "bg-accent text-primary ring-2 ring-primary" : "bg-muted text-muted-foreground",
                  )}
                  aria-hidden="true"
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : position + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("text-sm font-semibold", current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground")}>{item.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </>
            );
            return (
              <li key={item.id} aria-current={current ? "step" : undefined}>
                {href && (done || current) ? (
                  <a href={href} className={cn("flex items-center gap-2 rounded-lg border p-2.5 transition-colors hover:bg-accent/50", current && "border-primary/40 bg-white")}>
                    {content}
                  </a>
                ) : (
                  <div className={cn("flex items-center gap-2 rounded-lg border p-2.5", current && "border-primary/40 bg-white")}>{content}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {next && (
        <p className="text-sm text-muted-foreground">
          Siguiente paso:{" "}
          <a href={next.anchor} className="font-medium text-primary underline-offset-4 hover:underline">
            {next.label}
          </a>
          .
        </p>
      )}
    </header>
  );
}
