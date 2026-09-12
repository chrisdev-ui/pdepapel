"use client";

import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FormPageHeaderProps {
  title: string;
  /** Insignia de estado (Activa, Archivada…). */
  badge?: ReactNode;
  /** Una línea: «Útiles · 13 subcategorías · 197 productos · /tienda?typeId=utiles». */
  summary: ReactNode;
  backLabel: string;
  onBack: () => void;
  actions?: ReactNode;
}

/** Encabezado compartido de los formularios de atributos: volver, título, estado y resumen. */
export function FormPageHeader({ title, badge, summary, backLabel, onBack, actions }: FormPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Button type="button" variant="outline" size="icon-sm" aria-label={backLabel} onClick={onBack} className="shrink-0">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-bold tracking-tight text-primary">{title}</h1>
            {badge}
          </div>
          <p className="text-sm text-muted-foreground">{summary}</p>
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

interface FormStickyFooterProps {
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Barra inferior pegajosa con la acción principal del formulario. */
export function FormStickyFooter({ note, children, className }: FormStickyFooterProps) {
  return (
    <div
      className={cn(
        "sticky bottom-2 z-10 flex flex-col gap-3 rounded-xl border bg-white/95 p-3 shadow-md backdrop-blur sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : <span />}
      <div className="flex items-center gap-2 self-end sm:self-auto">{children}</div>
    </div>
  );
}

/** Lista compacta «etiqueta · valor» para la tarjeta «Uso» de los atributos. */
export function UsageList({ items }: { items: { label: string; value: ReactNode; hint?: string }[] }) {
  return (
    <dl className="flex flex-col divide-y">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
          <dt className="text-sm text-muted-foreground">
            {item.label}
            {item.hint && <span className="block text-xs text-muted-foreground/80">{item.hint}</span>}
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-primary">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
