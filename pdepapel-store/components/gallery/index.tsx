"use client";

import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import Image from "next/image";
import {
  KeyboardEvent,
  PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { Lightbox } from "@/components/gallery/lightbox";
import { cloudinaryImageLoader } from "@/lib/cloudinary-image-loader";
import { cn } from "@/lib/utils";
import { Image as ImageType } from "@/types";

interface GalleryProps {
  images: ImageType[];
  productName: string;
  /** La foto principal es el LCP de la ficha; en la vista rápida no. */
  priority?: boolean;
  /** Etiqueta sobre la foto (oferta, agotado…). */
  badge?: React.ReactNode;
}

const PRODUCT_IMAGE_SIZES =
  "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(100vw - 3rem), (max-width: 1279px) calc(50vw - 3rem), 608px";
const SWIPE_THRESHOLD = 40;
const ARROW =
  "absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-blue-yankees shadow-md transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink can-hover:flex can-hover:opacity-0 can-hover:group-hover:opacity-100 can-hover:group-focus-within:opacity-100";

/**
 * Galería de la ficha: miniaturas (a la izquierda en escritorio, debajo en
 * móvil), deslizar y flechas del teclado para cambiar de foto, y botón para
 * ampliar. Una sola foto grande en el DOM para no duplicar peticiones.
 */
export const Gallery: React.FC<GalleryProps> = ({
  images = [],
  productName,
  priority = true,
  badge,
}) => {
  const mainImageIndex = images.findIndex((image) => image.isMain);
  const [selectedIndex, setSelectedIndex] = useState(
    mainImageIndex >= 0 ? mainImageIndex : 0,
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const total = images.length;

  useEffect(() => {
    if (selectedIndex >= total) setSelectedIndex(0);
  }, [selectedIndex, total]);

  if (total === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-muted">
        <span className="text-muted-foreground">Sin imagen</span>
      </div>
    );
  }

  const selectedImage = images[selectedIndex] ?? images[0];
  const step = (delta: number) =>
    setSelectedIndex((current) => (current + delta + total) % total);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = event.clientX;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStart.current === null || total < 2) return;
    const delta = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    step(delta < 0 ? 1 : -1);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (total < 2) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    }
  };
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown(event);
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const next =
        (selectedIndex + (event.key === "ArrowRight" ? 1 : -1) + total) % total;
      tabRefs.current[next]?.focus();
    }
  };

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse lg:items-stretch lg:gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div
          role="group"
          aria-roledescription="carrusel"
          aria-label={`Fotos de ${productName}`}
          tabIndex={total > 1 ? 0 : -1}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (pointerStart.current = null)}
          className="group relative aspect-square w-full touch-pan-y select-none overflow-hidden rounded-xl bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
        >
          <Image
            fill
            loader={cloudinaryImageLoader}
            src={selectedImage.url}
            alt={productName}
            sizes={PRODUCT_IMAGE_SIZES}
            priority={priority}
            draggable={false}
            className="object-cover object-center"
          />
          {badge && (
            <div className="pointer-events-none absolute left-4 top-4">
              {badge}
            </div>
          )}
          {total > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Foto anterior"
                className={cn(ARROW, "left-3")}
              >
                <ChevronLeft aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Foto siguiente"
                className={cn(ARROW, "right-3")}
              >
                <ChevronRight aria-hidden="true" className="h-5 w-5" />
              </button>
              <p
                className="pointer-events-none absolute bottom-4 left-4 rounded-full bg-blue-yankees/75 px-2.5 py-1 font-quicksand text-xs font-semibold text-white"
                aria-live="polite"
              >
                <span className="sr-only">Foto </span>
                {selectedIndex + 1} / {total}
              </p>
            </>
          )}
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="absolute bottom-4 right-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 font-sans text-xs font-semibold text-blue-yankees shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
          >
            <Expand aria-hidden="true" className="h-3.5 w-3.5" />
            Ampliar
          </button>
        </div>
        {total > 1 && (
          <div
            className="flex justify-center gap-3 py-1 lg:hidden"
            aria-hidden="true"
          >
            {images.map((image, index) => (
              <span
                key={image.id}
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === selectedIndex
                    ? "w-5 bg-blue-yankees"
                    : "w-2 bg-blue-yankees/30",
                )}
              />
            ))}
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="lg:relative lg:w-16 lg:shrink-0 lg:self-stretch">
          <div
            role="tablist"
            aria-label="Miniaturas"
            aria-orientation="horizontal"
            className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:absolute lg:inset-0 lg:flex-col lg:overflow-y-auto lg:pb-0"
          >
            {images.map((image, index) => {
              const selected = selectedIndex === index;
              return (
                <button
                  key={image.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-label={`Vista ${index + 1} de ${total}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={onTabKeyDown}
                  className={cn(
                    "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 bg-gray-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2",
                    selected
                      ? "border-blue-yankees"
                      : "border-transparent hover:border-gray-300",
                  )}
                >
                  <Image
                    src={image.url}
                    alt={`Vista ${index + 1} de ${productName}`}
                    fill
                    loader={cloudinaryImageLoader}
                    sizes="64px"
                    className="object-cover object-center"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Lightbox
        images={images}
        productName={productName}
        index={selectedIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setSelectedIndex}
      />
    </div>
  );
};
