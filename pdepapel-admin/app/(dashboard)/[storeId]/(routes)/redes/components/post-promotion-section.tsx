"use client";

import axios from "axios";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { SocialPostSummary } from "@/lib/social/report";

const NUMBER = new Intl.NumberFormat("es-CO");
type Promotion = SocialPostSummary["promotion"];

/**
 * ¿Se promocionó? La API de Instagram cuenta solo lo orgánico: una publicación promocionada se ve floja y
 * distorsiona las comparaciones. La dueña decide; la sugerencia nunca saca nada sola.
 */
export function PostPromotionSection({ storeId, post, onChanged }: { storeId: string; post: SocialPostSummary; onChanged: () => Promise<void> }) {
  const { toast } = useToast();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const promoted = post.promotion === "PROMOTED";

  const decide = async (promotion: Promotion) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await axios.put(`/api/${storeId}/social/posts/${post.id}/promotion`, { promotion });
      await onChanged();
      toast({ title: promotion === "PROMOTED" ? "Marcada como promocionada" : promotion === "NOT_PROMOTED" ? "Marcada como orgánica" : "Sin decidir" });
    } catch (error) {
      toast({ title: "No se pudo guardar", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="font-semibold text-primary">
          ¿Se promocionó?
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={promoted}
          aria-label="Promocionado"
          disabled={busy}
          onClick={() => decide(promoted ? "NOT_PROMOTED" : "PROMOTED")}
          className="inline-flex min-h-[44px] items-center gap-2 font-semibold disabled:opacity-60"
        >
          <span aria-hidden className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${promoted ? "bg-primary" : "bg-muted-foreground/40"}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${promoted ? "translate-x-5" : "translate-x-0.5"}`} />
          </span>
          Promocionado
        </button>
      </div>
      {post.promotionSuggested && (
        <div className="flex flex-col gap-2 rounded-md bg-amber-50 p-2 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <p>
            Instagram cuenta {NUMBER.format(post.totalViews ?? 0)} vistas en total y {NUMBER.format(post.views ?? 0)} orgánicas. ¿Se promocionó?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="min-h-[44px]" disabled={busy} onClick={() => decide("PROMOTED")}>
              Sí, se promocionó
            </Button>
            <Button type="button" size="sm" variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => decide("NOT_PROMOTED")}>
              No
            </Button>
          </div>
        </div>
      )}
      {promoted ? (
        <p className="text-muted-foreground">
          {post.promotionSource === "AUTO" ? "La marcó Instagram: tiene un anuncio activo. " : ""}
          No cuenta en la mediana, «× mediana», «Qué funciona», «Mejor horario» ni la alerta temprana: las vistas que da Instagram son solo orgánicas.
        </p>
      ) : (
        <p className="text-muted-foreground">Si le pusiste pauta, márcala: así no cuenta como si le hubiera ido mal.</p>
      )}
      {post.totalViews != null && <p className="text-muted-foreground">Vistas totales (con lo promocionado): {NUMBER.format(post.totalViews)}</p>}
    </section>
  );
}
