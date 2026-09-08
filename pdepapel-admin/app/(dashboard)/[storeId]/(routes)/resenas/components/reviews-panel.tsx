"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/data-table";
import { Models } from "@/constants";
import { cn } from "@/lib/utils";

import { columns, type ReviewsColumn } from "./columns";
import { ReviewMobileCard } from "./review-mobile-card";

interface ReviewsPanelProps {
  data: ReviewsColumn[];
}

export type ReviewView = "todas" | "sin-responder" | "por-atender" | "ocultas";

const VIEW_PARAM = "vista";
const DEFAULT_VIEW: ReviewView = "todas";

export const REVIEW_VIEWS: { id: ReviewView; label: string; description: string }[] = [
  { id: "todas", label: "Todas", description: "Todas las reseñas de la tienda, publicadas u ocultas." },
  { id: "sin-responder", label: "Sin responder", description: "Publicadas sin respuesta de la tienda; una respuesta corta mejora la confianza." },
  { id: "por-atender", label: "Por atender", description: "Con 2 estrellas o menos: responde o revisa el producto." },
  { id: "ocultas", label: "Ocultas", description: "No se muestran en la tienda; siguen aquí y se pueden publicar de nuevo." },
];

export const isReviewView = (value: string | null | undefined): value is ReviewView => REVIEW_VIEWS.some((view) => view.id === value);

/** Filtro puro de la pestaña Reseñas; compartido con las pruebas. */
export function filterReviews<T extends Pick<ReviewsColumn, "status" | "reply" | "rating">>(reviews: T[], view: ReviewView): T[] {
  switch (view) {
    case "sin-responder":
      return reviews.filter((review) => review.status !== "HIDDEN" && !review.reply);
    case "por-atender":
      return reviews.filter((review) => review.rating <= 2);
    case "ocultas":
      return reviews.filter((review) => review.status === "HIDDEN");
    default:
      return reviews;
  }
}

/**
 * Pestaña Reseñas dentro de Clientes: contadores, vistas en la URL y la
 * tabla con moderación (ocultar, publicar, responder) por fila.
 */
export function ReviewsPanel({ data }: ReviewsPanelProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<ReviewView>(isReviewView(requested) ? requested : DEFAULT_VIEW);

  const setView = (next: ReviewView) => {
    setViewState(next);
    const query = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, next);
    const suffix = query.toString();
    window.history.replaceState(null, "", suffix ? `${pathname}?${suffix}` : pathname);
  };

  const published = useMemo(() => data.filter((review) => review.status !== "HIDDEN"), [data]);
  const average = useMemo(
    () => (published.length ? published.reduce((sum, review) => sum + review.rating, 0) / published.length : 0),
    [published],
  );
  const counts = useMemo<Record<ReviewView, number>>(
    () => ({
      todas: data.length,
      "sin-responder": filterReviews(data, "sin-responder").length,
      "por-atender": filterReviews(data, "por-atender").length,
      ocultas: filterReviews(data, "ocultas").length,
    }),
    [data],
  );
  const rows = useMemo(() => filterReviews(data, view), [data, view]);
  const current = REVIEW_VIEWS.find((item) => item.id === view) ?? REVIEW_VIEWS[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Publicadas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{published.length}</p>
          <p className="text-xs text-muted-foreground">Visibles en la tienda</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Promedio</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{average ? average.toFixed(1) : "—"}</p>
          <p className="text-xs text-muted-foreground">De 5 estrellas, solo publicadas</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sin responder</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{counts["sin-responder"]}</p>
          <p className="text-xs text-muted-foreground">Publicadas sin respuesta de la tienda</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por atender</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{counts["por-atender"]}</p>
          <p className="text-xs text-muted-foreground">Con 2 estrellas o menos</p>
        </div>
      </div>

      <div role="tablist" aria-label="Vistas de reseñas" className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1">
        {REVIEW_VIEWS.map((item) => {
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
      <p className="text-sm text-muted-foreground">{current.description}</p>

      <DataTable
        tableKey={Models.Reviews}
        searchPlaceholder="Buscar producto, cliente, comentario o respuesta…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        renderMobileCard={(row) => <ReviewMobileCard review={row.original} />}
        emptyState={
          view === "todas"
            ? { title: "Aún no hay reseñas", description: "Cuando un cliente califique un producto en la tienda aparecerá aquí." }
            : { title: `Nada en «${current.label}»`, description: current.description }
        }
      />
    </div>
  );
}
