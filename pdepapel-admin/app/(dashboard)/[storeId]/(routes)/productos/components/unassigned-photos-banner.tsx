"use client";

import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface UnassignedPhotosBannerProps {
  count: number;
  /** Ya se intentó guardar y se frenó: el texto dice que no se guardó. */
  blocked: boolean;
  onGoToPhotos: () => void;
}

export function UnassignedPhotosBanner({ count, blocked, onGoToPhotos }: UnassignedPhotosBannerProps) {
  if (count === 0) return null;
  const photos = `${count} ${count === 1 ? "foto" : "fotos"}`;
  return (
    <Alert variant={blocked ? "destructive" : "warning"} className={blocked ? "bg-destructive/5" : undefined}>
      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>{blocked ? `No se guardó: faltan ${photos} por repartir` : `${photos} sin repartir`}</AlertTitle>
      <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>
          El grupo no se guarda hasta que elijas a quién le toca cada una: «Todas las variantes», un color, un diseño o una combinación.
        </span>
        <Button type="button" size="sm" variant="outline" className="shrink-0 self-start sm:self-auto" onClick={onGoToPhotos}>
          Ir a las fotos
        </Button>
      </AlertDescription>
    </Alert>
  );
}
