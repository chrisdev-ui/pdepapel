"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { cn } from "@/lib/utils";
import { Image as ImageType } from "@/types";

interface LightboxProps {
  images: ImageType[];
  productName: string;
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}

const ARROW_BUTTON =
  "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-blue-yankees shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink";

/** Foto a pantalla completa: toca o haz clic para acercar, flechas para cambiar, Esc para cerrar. */
export function Lightbox({ images, productName, index, open, onOpenChange, onIndexChange }: LightboxProps) {
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const total = images.length;
  const image = images[index] ?? images[0];

  useEffect(() => {
    setZoom(null);
  }, [index, open]);

  const step = (delta: number) => onIndexChange((index + delta + total) % total);

  const toggleZoom = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (zoom) return setZoom(null);
    const rect = event.currentTarget.getBoundingClientRect();
    setZoom({ x: ((event.clientX - rect.left) / rect.width) * 100, y: ((event.clientY - rect.top) / rect.height) * 100 });
  };

  if (!image) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") step(1);
          if (event.key === "ArrowLeft") step(-1);
        }}
        className="left-0 top-0 h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 gap-0 rounded-none border-0 bg-blue-yankees/95 p-0 text-white sm:rounded-none"
      >
        <DialogTitle className="sr-only">{productName}</DialogTitle>
        <DialogDescription className="sr-only">Imagen ampliada del producto. Usa las flechas para cambiar de foto.</DialogDescription>
        <div className="relative flex h-full w-full items-center justify-center" style={{ touchAction: "pinch-zoom" }}>
          {total > 1 && (
            <>
              <button type="button" onClick={() => step(-1)} aria-label="Foto anterior" className={cn(ARROW_BUTTON, "left-3")}>
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Foto siguiente" className={cn(ARROW_BUTTON, "right-3")}>
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={toggleZoom}
            aria-label={zoom ? "Alejar imagen" : "Acercar imagen"}
            className={cn("relative h-[min(92vh,92vw)] w-[min(92vh,92vw)] overflow-hidden rounded-xl bg-black/20", zoom ? "cursor-zoom-out" : "cursor-zoom-in")}
          >
            <CloudinaryImage
              fill
              src={image.url}
              alt={`${productName}, foto ${index + 1} de ${total}`}
              sizes="92vw"
              className="object-contain transition-transform duration-200 motion-reduce:transition-none"
              style={zoom ? { transform: "scale(2.5)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
            />
          </button>
          {total > 1 && (
            <p className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 font-quicksand text-sm font-semibold" aria-live="polite">
              {index + 1} / {total}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
