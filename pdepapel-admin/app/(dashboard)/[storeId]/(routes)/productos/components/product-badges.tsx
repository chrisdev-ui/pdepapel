import { Badge } from "@/components/ui/badge";
import type { ProductShape, Readiness } from "@/lib/product-readiness";
import { formatAvailableAt, isComingSoon } from "@/lib/product-availability";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = { mint: "bg-tint-mint", cream: "bg-tint-cream", sky: "bg-tint-sky", slate: "bg-muted", pink: "bg-tint-pink", lavender: "bg-tint-lavender" };
const SHAPE_TONE: Record<ProductShape, string> = { individual: "slate", variante: "lavender", kit: "cream" };

export function ProductTintBadge({ label, tone, className, title }: { label: string; tone: string; className?: string; title?: string }) {
  return (
    <Badge variant="outline" title={title} className={cn("whitespace-nowrap border-transparent font-semibold text-primary", TONES[tone] ?? "bg-muted", className)}>
      {label}
    </Badge>
  );
}

export function ShapeBadge({ shape }: { shape: { id: ProductShape; label: string } }) {
  return <ProductTintBadge label={shape.label} tone={SHAPE_TONE[shape.id]} />;
}

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  const brokenImage = readiness.checks.some((check) => check.id === "image-health" && !check.ok);
  if (readiness.complete) return <ProductTintBadge label="Listo" tone="mint" />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <ProductTintBadge label={`Faltan ${readiness.total - readiness.done}`} tone="cream" title={`Falta: ${readiness.missing.join(", ")}`} />
      {brokenImage && <ProductTintBadge label="Imagen rota" tone="pink" title="La foto ya no existe en Cloudinary; súbela de nuevo." />}
    </span>
  );
}

export function StockBadge({ stock, isArchived, availableAt }: { stock: number; isArchived: boolean; availableAt?: Date | string | null }) {
  if (isArchived) return <ProductTintBadge label="Archivado" tone="slate" />;
  if (availableAt && isComingSoon({ availableAt })) return <ProductTintBadge label={`Llega el ${formatAvailableAt(availableAt)}`} tone="lavender" title="Próximamente: se muestra en la tienda sin botón de compra" />;
  if (stock <= 0) return <ProductTintBadge label="Agotado" tone="pink" />;
  if (stock <= 5) return <ProductTintBadge label={`${stock} und`} tone="cream" title="Stock crítico" />;
  return <span className="text-sm font-semibold tabular-nums text-primary">{stock}</span>;
}
