import type { CSSProperties } from "react";

import { getSwatchPaint, type SwatchPaint } from "@/lib/color-swatch";
import { cn } from "@/lib/utils";
import type { Color } from "@/types";

type SwatchSize = "sm" | "dot" | "md";

interface ColorSwatchProps {
  color: Pick<Color, "value" | "swatchType">;
  /**
   * `md`: 44 px del selector de la ficha (pintura de 36 px con 2 px de aire);
   * `dot`: 20 px del producto sin variantes; `sm`: 14 px del filtro.
   */
  size?: SwatchSize;
  selected?: boolean;
  soldOut?: boolean;
  className?: string;
}

const GLOW: Record<SwatchSize, string> = { md: "0 0 8px 2px", dot: "0 0 4px 1px", sm: "0 0 3px 1px" };

/** Estilo en línea de la pintura: hex primero (respaldo) y el degradado aparte. */
export function swatchPaintStyle(paint: SwatchPaint, size: SwatchSize = "md"): CSSProperties {
  return {
    backgroundColor: paint.backgroundColor,
    backgroundImage: paint.backgroundImage,
    backgroundSize: paint.backgroundSize,
    backgroundPosition: paint.backgroundPosition,
    boxShadow: [paint.ring, paint.glowColor ? `${GLOW[size]} ${paint.glowColor}` : null].filter(Boolean).join(", "),
  };
}

/**
 * Muestra de color (issue #3). Solo presentación y siempre `aria-hidden`: el
 * nombre accesible lo pone quien la envuelve (el enlace de la ficha con su
 * `aria-label`, la etiqueta de la casilla del filtro). Pinta según
 * `swatchType`; sin él, el hex como sólido.
 */
export function ColorSwatch({ color, size = "md", selected = false, soldOut = false, className }: ColorSwatchProps) {
  const paint = getSwatchPaint(color.swatchType, color.value);
  const data = { "data-swatch-type": paint.type, "data-swatch-assorted": paint.assorted || undefined, "data-swatch-unknown": paint.unknown || undefined };

  if (size !== "md") {
    return (
      <span
        aria-hidden="true"
        {...data}
        className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5", className)}
        style={swatchPaintStyle(paint, size)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      {...data}
      data-selected={selected || undefined}
      data-sold-out={soldOut || undefined}
      className={cn(
        "relative block h-11 w-11 shrink-0 rounded-full border-2 bg-white transition-colors",
        selected ? "border-blue-yankees ring-1 ring-blue-yankees" : "border-transparent group-hover:border-gray-300",
        className,
      )}
    >
      <span
        data-swatch-paint=""
        className={cn(
          "absolute inset-0.5 flex items-center justify-center rounded-full font-sans text-sm font-bold text-slate-600",
          soldOut && "opacity-[0.45]",
        )}
        style={swatchPaintStyle(paint, size)}
      >
        {paint.unknown ? "?" : null}
      </span>
      {soldOut && (
        // Diagonal azul marino con contorno blanco: se ve sobre rojo, negro y blanco.
        <span data-swatch-slash="" className="absolute inset-0 flex items-center justify-center">
          <span className="block h-0.5 w-full rotate-45 bg-blue-yankees shadow-[0_0_0_1.5px_#ffffff]" />
        </span>
      )}
    </span>
  );
}
