"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TintBadge } from "@/components/ui/tint-badge";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  type ProductShape,
  type Readiness,
} from "@/lib/product-readiness";
import {
  getProductStatus,
  PRODUCT_STATUS,
  productStockLabel,
} from "@/lib/product-status";
import { Star } from "lucide-react";

const SHAPE_TONE: Record<ProductShape, string> = {
  individual: "slate",
  variante: "lavender",
  kit: "cream",
};

/** Alias de la insignia compartida; se mantiene por los importadores del módulo. */
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
    <span title={title} className="inline-flex">
      <TintBadge label={label} tone={tone} className={className} />
    </span>
  );
}

export function ShapeBadge({
  shape,
}: {
  shape: { id: ProductShape; label: string };
}) {
  return <TintBadge label={shape.label} tone={SHAPE_TONE[shape.id]} />;
}

/**
 * Qué le falta al producto, en un popover accesible por clic, toque y
 * teclado (un `title=` no aparece en móvil).
 */
export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const brokenImage = readiness.checks.some(
    (check) => check.id === "image-health" && !check.ok,
  );
  if (readiness.complete) return <TintBadge label="Lista" tone="mint" />;
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
            <TintBadge
              label={pending === 1 ? "Falta 1" : `Faltan ${pending}`}
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

/** Estado en la tienda con el stock siempre visible (también archivado). */
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
  const product = { stock, isArchived, availableAt };
  const status = getProductStatus(product, threshold);
  const label = productStockLabel(product, threshold);
  if (status === "a-la-venta")
    return (
      <span className="text-sm font-semibold tabular-nums text-primary">
        {stock}
      </span>
    );
  return (
    <ProductTintBadge
      label={label}
      tone={PRODUCT_STATUS[status].tone}
      title={
        status === "proximamente"
          ? "Próximamente: se muestra en la tienda sin botón de compra"
          : status === "stock-critico"
            ? "Stock crítico"
            : undefined
      }
    />
  );
}

/** Insignia «Oferta: nombre» cuando el precio mostrado viene de una oferta. */
export function OfferBadge({ label }: { label?: string | null }) {
  if (!label) return null;
  return (
    <ProductTintBadge
      label={`Oferta: ${label}`}
      tone="pink"
      className="max-w-[200px] truncate"
      title={`Precio con la oferta «${label}»`}
    />
  );
}
