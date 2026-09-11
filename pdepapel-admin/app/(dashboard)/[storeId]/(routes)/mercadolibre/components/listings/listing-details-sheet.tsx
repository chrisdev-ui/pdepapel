"use client";

import { Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TintBadge } from "@/components/ui/tint-badge";

import type { ContentReview, Listing, ListingQuality } from "./listing-types";

export type ListingDetailsHandlers = {
  onRefreshQuality: (listing: Listing) => void;
  onRefreshContent: (listing: Listing) => void;
  onSnoozeVideoReminder: (listing: Listing) => void;
  onShowVideoReminder: (listing: Listing) => void;
  onPrepareClip: (listing: Listing, uploadUrl: string | null) => void;
};

/**
 * Calidad de Mercado Libre y revisión de contenido de una publicación, en un
 * panel lateral en vez de expandir la fila: la tabla queda estable y el
 * detalle cabe en el celular.
 */
export function ListingDetailsSheet({
  listing,
  quality,
  contentReview,
  isLoadingQuality,
  isLoadingContent,
  isUpdatingVideoReminder,
  handlers,
  onClose,
}: {
  listing: Listing | null;
  quality: ListingQuality | undefined;
  contentReview: ContentReview | undefined;
  isLoadingQuality: boolean;
  isLoadingContent: boolean;
  isUpdatingVideoReminder: boolean;
  handlers: ListingDetailsHandlers;
  onClose: () => void;
}) {
  const videoRecommendation = quality?.videoRecommendation ?? null;
  const rules = quality?.pendingRules.filter((rule) => !rule.isVideoRecommendation) ?? [];
  return (
    <Sheet open={Boolean(listing)} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="flex w-full flex-col gap-5 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle>{listing?.product.name ?? "Publicación"}</SheetTitle>
          <SheetDescription>
            Calidad reportada por Mercado Libre y revisión local del contenido.
          </SheetDescription>
        </SheetHeader>
        {listing ? (
          <>
            <section className="flex flex-col gap-3" aria-labelledby="listing-quality-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="listing-quality-title" className="text-sm font-bold text-primary">
                  Calidad de Mercado Libre
                </h3>
                {listing.externalItemId ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    isLoading={isLoadingQuality}
                    loadingText="Consultando…"
                    onClick={() => handlers.onRefreshQuality(listing)}
                  >
                    {quality ? "Actualizar calidad" : "Consultar calidad"}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Disponible después de publicar.
                  </span>
                )}
              </div>
              {quality ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {quality.score !== null ? (
                      <TintBadge label={`${Math.round(quality.score)} / 100`} tone="sky" />
                    ) : null}
                    {(quality.levelWording ?? quality.level) ? (
                      <TintBadge label={quality.levelWording ?? quality.level ?? ""} tone="slate" />
                    ) : null}
                  </div>
                  {rules.length > 0 ? (
                    <ul className="flex flex-col gap-1 text-sm">
                      {rules.map((rule) => (
                        <li key={`${rule.mode}-${rule.title}`} className="flex gap-2">
                          <span aria-hidden="true">•</span>
                          <span>
                            {rule.title}
                            {rule.link ? (
                              <>
                                {" "}
                                <a
                                  href={rule.link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline underline-offset-2"
                                >
                                  Ver en Mercado Libre
                                </a>
                              </>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : !videoRecommendation ? (
                    <p className="text-sm text-success">No hay acciones pendientes reportadas.</p>
                  ) : null}
                  {videoRecommendation ? (
                    <div className="flex flex-col gap-2 rounded-xl border border-tint-sky bg-tint-sky/30 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Video className="h-4 w-4 text-primary" aria-hidden="true" />
                        <p className="font-semibold text-primary">Clip recomendado</p>
                        <TintBadge
                          label={`${videoRecommendation.preparedVideoCount} listo${videoRecommendation.preparedVideoCount === 1 ? "" : "s"}`}
                          tone="slate"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {videoRecommendation.title}. P de Papel prepara el video y la carga
                        final se confirma en Mercado Libre.
                      </p>
                      {videoRecommendation.snoozedUntil ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs text-muted-foreground">
                            El recordatorio está pospuesto.
                          </p>
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            isLoading={isUpdatingVideoReminder}
                            onClick={() => handlers.onShowVideoReminder(listing)}
                          >
                            Mostrar ahora
                          </Button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="xs"
                            variant="outline"
                            onClick={() =>
                              handlers.onPrepareClip(listing, videoRecommendation.link)
                            }
                          >
                            <Video className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            {videoRecommendation.preparedVideoCount > 0
                              ? "Revisar clip"
                              : "Preparar clip"}
                          </Button>
                          {videoRecommendation.link ? (
                            <Button asChild type="button" size="xs" variant="outline">
                              <a href={videoRecommendation.link} target="_blank" rel="noreferrer">
                                Subir en Mercado Libre
                              </a>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            isLoading={isUpdatingVideoReminder}
                            onClick={() => handlers.onSnoozeVideoReminder(listing)}
                          >
                            Recordar en 30 días
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : listing.externalItemId ? (
                <p className="text-sm text-muted-foreground">
                  Consulta la calidad para ver la puntuación y las acciones pendientes.
                </p>
              ) : null}
            </section>

            <section className="flex flex-col gap-3" aria-labelledby="listing-content-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="listing-content-title" className="text-sm font-bold text-primary">
                  Revisión de contenido
                </h3>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  isLoading={isLoadingContent}
                  loadingText="Revisando…"
                  onClick={() => handlers.onRefreshContent(listing)}
                >
                  {contentReview ? "Volver a revisar" : "Revisar contenido"}
                </Button>
              </div>
              {contentReview ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Nombre de familia: {contentReview.familyNameLength} caracteres ·{" "}
                    {contentReview.descriptionPreview || "Sin descripción visible"}
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {contentReview.checks.map((check) => (
                      <li
                        key={check.label}
                        className={check.ready ? "text-success" : "text-warning"}
                      >
                        <span aria-hidden="true">{check.ready ? "✓" : "•"}</span>{" "}
                        <span className="sr-only">{check.ready ? "Listo:" : "Pendiente:"}</span>
                        {check.label}: {check.detail}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Es una revisión local orientativa; Mercado Libre valida además la categoría,
                    la ficha obligatoria y las unidades al publicar.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Revisa el contenido para ver qué falta antes de publicar o sincronizar.
                </p>
              )}
            </section>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
