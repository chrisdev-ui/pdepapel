"use client";

import { Star, Trash, Undo2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import type { OwnPhotoRemoval } from "@/lib/product-group-form-state";
import { cn } from "@/lib/utils";

export interface VariantOwnPhotosRow {
  id: string;
  name: string;
  images: string[];
  coverUrl?: string;
  /** Fotos propias que también le llegan desde el grupo: quitarlas aquí no las quitaría de la galería. */
  groupDelivered: string[];
}

interface VariantOwnPhotosProps {
  variants: VariantOwnPhotosRow[];
  pending: OwnPhotoRemoval[];
  disabled?: boolean;
  onRemove: (productId: string, url: string) => void;
  onUndo: (productId: string, url: string) => void;
  onSetCover: (productId: string, url: string) => void;
}

export function VariantOwnPhotos({ variants, pending, disabled, onRemove, onUndo, onSetCover }: VariantOwnPhotosProps) {
  const withPhotos = variants.filter((variant) => variant.images.length > 0);
  if (withPhotos.length === 0) return null;
  const isPending = (productId: string, url: string) =>
    pending.some((removal) => removal.productId === productId && removal.url === url);

  return (
    <section aria-labelledby="fotos-propias-titulo" className="flex flex-col gap-3">
      <div>
        <p id="fotos-propias-titulo" className="text-sm font-semibold text-primary">
          Fotos propias de cada variante
        </p>
        <p className="text-xs text-muted-foreground">
          Solo las tiene esa variante y van antes de las del grupo. Lo que quites aquí se borra de esa variante al guardar.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {withPhotos.map((variant) => {
          const liveCover = variant.coverUrl && !isPending(variant.id, variant.coverUrl) ? variant.coverUrl : undefined;
          return (
            <li key={variant.id} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 break-words text-sm font-medium">{variant.name}</p>
                {!liveCover && <p className="text-xs text-muted-foreground">Portada: una foto del grupo</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {variant.images.map((url) => {
                  const removing = isPending(variant.id, url);
                  const isCover = url === liveCover;
                  const fromGroup = variant.groupDelivered.includes(url);
                  return (
                    <div
                      key={url}
                      data-testid="foto-propia"
                      className={cn("flex flex-col gap-2 rounded-md border p-2", removing && "opacity-50", isCover && "border-primary")}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md border">
                        <Image src={url} alt="" fill sizes="(max-width: 640px) 50vw, 200px" className="object-cover" />
                        {isCover && (
                          <span className="absolute bottom-1 left-1 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                            Portada
                          </span>
                        )}
                      </div>
                      {removing ? (
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] text-muted-foreground">Se quita al guardar</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={disabled}
                            onClick={() => onUndo(variant.id, url)}
                            aria-label={`Deshacer: conservar la foto en ${variant.name}`}
                          >
                            <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                            Deshacer
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant={isCover ? "secondary" : "ghost"}
                            className="h-7 w-7"
                            disabled={disabled || isCover}
                            aria-pressed={isCover}
                            onClick={() => onSetCover(variant.id, url)}
                            aria-label={isCover ? `Es la portada de ${variant.name}` : `Usar como portada de ${variant.name}`}
                          >
                            <Star className={cn("h-4 w-4", isCover && "fill-current")} aria-hidden="true" />
                          </Button>
                          {fromGroup ? (
                            <span className="text-right text-[11px] text-muted-foreground">También llega del grupo</span>
                          ) : (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              disabled={disabled}
                              onClick={() => onRemove(variant.id, url)}
                              aria-label={`Quitar de ${variant.name}`}
                            >
                              <Trash className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
