"use client";

import type { AnchorHTMLAttributes } from "react";

import { Button } from "@/components/ui/button";
import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { cn } from "@/lib/utils";

/** Los enlaces no se deshabilitan: mientras carga una variante se ven y se comportan como deshabilitados. */
const LINK_DISABLED = "aria-disabled:pointer-events-none aria-disabled:opacity-50";

interface DesignOptionProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  name: string;
  /** Foto principal de la variante a la que lleva el clic; `null` → chip de texto. */
  image: string | null;
  isActive: boolean;
  isOutOfStock: boolean;
}

/**
 * Opción de diseño de la ficha (issue #3). Con foto: miniatura de 40×40 más
 * el nombre. La miniatura pasa por `CloudinaryImage` con 40×40, que pide la
 * misma copia `w_128` que la barra fija (1x = 40 y 2x = 80 se redondean a
 * 128): ninguna transformación nueva. Caja fija, carga diferida, `alt=""`
 * porque el nombre ya está en el texto del enlace.
 */
export function DesignOption({ name, image, isActive, isOutOfStock, className, ...linkProps }: DesignOptionProps) {
  if (!image) {
    // El chip de texto de siempre, sin cambios: mismo `Button` y mismas clases.
    return (
      <Button
        asChild
        variant={isActive ? "default" : "outline"}
        className={cn(
          "min-h-11 rounded-full border-2 px-4 py-2 font-sans text-sm font-medium transition-colors",
          LINK_DISABLED,
          isActive
            ? "border-blue-yankees bg-blue-yankees text-white hover:bg-blue-yankees"
            : "border-gray-200 bg-white text-gray-900 hover:border-gray-300",
          isOutOfStock && "line-through opacity-50",
          className,
        )}
      >
        <a {...linkProps}>
          {name}
          {isOutOfStock && <span className="sr-only"> (agotado)</span>}
        </a>
      </Button>
    );
  }

  return (
    <a
      {...linkProps}
      data-design-thumbnail=""
      className={cn(
        "inline-flex min-h-[52px] items-center gap-2.5 rounded-2xl border-2 py-1 pl-1 pr-3.5 font-sans text-sm font-medium text-gray-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
        LINK_DISABLED,
        isActive ? "border-blue-yankees bg-blue-baby/20" : "border-gray-200 bg-white hover:border-gray-300",
        className,
      )}
    >
      <CloudinaryImage
        src={image}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        className={cn(
          "h-10 w-10 shrink-0 rounded-[10px] bg-gray-100 object-cover",
          isOutOfStock && "opacity-[0.55] grayscale",
        )}
      />
      <span className={cn(isOutOfStock && "text-gray-500 line-through")}>{name}</span>
      {/* El espacio va como texto suelto del enlace: así el nombre accesible es «X (agotado)», no «X(agotado)». */}
      {isOutOfStock && <> <span className="sr-only">(agotado)</span></>}
    </a>
  );
}
