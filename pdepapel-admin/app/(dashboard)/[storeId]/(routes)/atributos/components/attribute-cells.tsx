"use client";

import type { Row } from "@tanstack/react-table";
import Link from "next/link";
import type { ReactNode } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { TintBadge } from "@/components/ui/tint-badge";
import type { AttributeHint } from "@/lib/attribute-hints";
import { cn } from "@/lib/utils";

/** Fila de una tabla de Atributos con las pistas y la proporción de uso ya calculadas. */
export type Decorated<T> = T & { hints: AttributeHint[]; share: number; usage: number };

/** Chips de pista junto al nombre: «Parecido a…», «Sin productos», «Valor con espacio…». */
export function AttributeHintChips({ hints, className }: { hints: readonly AttributeHint[]; className?: string }) {
  if (hints.length === 0) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {hints.map((hint) => (
        <TintBadge key={hint.kind} label={hint.label} tone={hint.tone} className="text-[11px]" />
      ))}
    </span>
  );
}

interface AttributeNameCellProps {
  href: string;
  name: string;
  /** Muestra de color o icono a la izquierda. */
  leading?: ReactNode;
  /** Línea secundaria (valor, categoría padre…). */
  secondary?: ReactNode;
  hints: readonly AttributeHint[];
}

/** Nombre enlazado a la ficha, con muestra/icono, línea secundaria y pistas. */
export function AttributeNameCell({ href, name, leading, secondary, hints }: AttributeNameCellProps) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {leading}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline">
            {name}
          </Link>
          <AttributeHintChips hints={hints} />
        </div>
        {secondary && <span className="text-xs text-muted-foreground">{secondary}</span>}
      </div>
    </div>
  );
}

/** Conteo con barra proporcional a la fila más usada. */
export function AttributeUsageCell({ usage, share, className }: { usage: number; share: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} />
      </span>
      <span className="tabular-nums">{usage}</span>
    </div>
  );
}

const relative = new Intl.RelativeTimeFormat("es", { numeric: "auto" });

/** «hace 3 días», «hace 5 meses»: suficiente para saber si algo se tocó hace poco. */
export function formatRelativeDate(date: Date | string): string {
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.round((then - Date.now()) / 86_400_000);
  if (Math.abs(days) < 1) return "hoy";
  if (Math.abs(days) < 30) return relative.format(days, "day");
  if (Math.abs(days) < 365) return relative.format(Math.round(days / 30), "month");
  return relative.format(Math.round(days / 365), "year");
}

export function AttributeUpdatedCell({ date }: { date: Date | string }) {
  return (
    <span className="text-xs text-muted-foreground" title={new Date(date).toLocaleString("es-CO")}>
      {formatRelativeDate(date)}
    </span>
  );
}

interface AttributeMobileCardProps<T> {
  row: Row<T>;
  href: string;
  title: string;
  leading?: ReactNode;
  /** «#F9C5D1 · hace 5 meses», «Escritura · indexada». */
  meta?: ReactNode;
  hints: readonly AttributeHint[];
  usage: number;
  usageLabel: string;
  share: number;
  isArchived: boolean;
  actions: ReactNode;
}

/** Tarjeta de una fila por debajo de `sm`: sustituye a la tabla en celular. */
export function AttributeMobileCard<T>({ row, href, title, leading, meta, hints, usage, usageLabel, share, isArchived, actions }: AttributeMobileCardProps<T>) {
  const selected = row.getIsSelected();
  return (
    <article className={cn("flex gap-3 rounded-xl border bg-white p-3 shadow-sm", selected && "border-primary bg-accent/40")}>
      <Checkbox className="mt-0.5" checked={selected} onCheckedChange={(checked) => row.toggleSelected(checked === true)} aria-label={`Seleccionar ${title}`} />
      {leading}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <Link href={href} className="min-w-0 break-words text-sm font-bold text-primary">
            {title}
          </Link>
          <TintBadge label={isArchived ? "Archivado" : "Activo"} tone={isArchived ? "slate" : "mint"} />
        </div>
        <AttributeHintChips hints={hints} />
        <div className="flex items-center gap-2">
          <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full rounded-full bg-primary/70" style={{ width: `${share}%` }} />
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">
            {usage} {usageLabel}
          </span>
        </div>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      <div className="shrink-0 self-start">{actions}</div>
    </article>
  );
}
