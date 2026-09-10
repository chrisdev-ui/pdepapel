"use client";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Star } from "lucide-react";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  type ProductShape,
  type Readiness,
} from "@/lib/product-readiness";
import { formatAvailableAt, isComingSoon } from "@/lib/product-availability";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  mint: "bg-tint-mint",
  cream: "bg-tint-cream",
  sky: "bg-tint-sky",
  slate: "bg-muted",
  pink: "bg-tint-pink",
  lavender: "bg-tint-lavender",
};
const SHAPE_TONE: Record<ProductShape, string> = {
  individual: "slate",
  variante: "lavender",
  kit: "cream",
};

export function ProductTintBadge({
  label,
  tone,
  className,
  title,
}: {
  label: string;
  tone: string;
  className?: string;
  title?: string;
}) {
  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        "whitespace-nowrap border-transparent font-semibold text-primary",
        TONES[tone] ?? "bg-muted",
        className,
      )}
    >
      {label}
    </Badge>
  );
}

export function ShapeBadge({
  shape,
}: {
  shape: { id: ProductShape; label: string };
}) {
  return <ProductTintBadge label={shape.label} tone={SHAPE_TONE[shape.id]} />;
}

/**
 * Qué le falta al producto. Antes el detalle vivía solo en un `title=`: no
 * aparece al tocar en móvil ni al navegar con teclado, así que en la práctica
 * "Faltan 3" no se podía resolver sin abrir el producto. Ahora es un botón con
 * un popover, accesible por clic, toque y teclado.
 */
export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const brokenImage = readiness.checks.some(
    (check) => check.id === "image-health" && !check.ok,
  );
  if (readiness.complete) return <ProductTintBadge label="Listo" tone="mint" />;
  const pending = readiness.total - readiness.done;
  return (
    <span
      className="inline-flex flex-wrap items-center gap-1"
      data-no-row-click
    >
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Faltan ${pending}: ${readiness.missing.join(", ")}. Ver detalle`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProductTintBadge
              label={`Faltan ${pending}`}
              tone="cream"
              className="cursor-pointer"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-3">
          <p className="text-xs font-semibold text-primary">
            Falta para venderlo
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {readiness.checks
              .filter((check) => !check.ok)
              .map((check) => (
                <li key={check.id} className="flex flex-col text-xs">
                  <span className="font-medium text-primary">
                    {check.label}
                  </span>
                  {check.hint && (
                    <span className="text-muted-foreground">{check.hint}</span>
                  )}
                </li>
              ))}
          </ul>
        </PopoverContent>
      </Popover>
      {brokenImage && (
        <ProductTintBadge
          label="Imagen rota"
          tone="pink"
          title="La foto ya no existe en Cloudinary; súbela de nuevo."
        />
      )}
    </span>
  );
}

/** `isFeatured` no se veía en ninguna parte, aunque se puede cambiar en lote. */
export function FeaturedBadge({ isFeatured }: { isFeatured: boolean }) {
  if (!isFeatured) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-tint-sky px-2 py-0.5 text-[11px] font-semibold text-primary"
      title="Destacado: aparece primero en la portada de la tienda"
    >
      <Star className="h-3 w-3 fill-current" aria-hidden="true" />
      Destacado
    </span>
  );
}

export function StockBadge({
  stock,
  isArchived,
  availableAt,
  threshold = DEFAULT_LOW_STOCK_THRESHOLD,
}: {
  stock: number;
  isArchived: boolean;
  availableAt?: Date | string | null;
  threshold?: number;
}) {
  if (isArchived) return <ProductTintBadge label="Archivado" tone="slate" />;
  if (availableAt && isComingSoon({ availableAt }))
    return (
      <ProductTintBadge
        label={`Llega el ${formatAvailableAt(availableAt)}`}
        tone="lavender"
        title="Próximamente: se muestra en la tienda sin botón de compra"
      />
    );
  if (stock <= 0) return <ProductTintBadge label="Agotado" tone="pink" />;
  if (stock <= threshold)
    return (
      <ProductTintBadge
        label={`${stock} und`}
        tone="cream"
        title="Stock crítico"
      />
    );
  return (
    <span className="text-sm font-semibold tabular-nums text-primary">
      {stock}
    </span>
  );
}
