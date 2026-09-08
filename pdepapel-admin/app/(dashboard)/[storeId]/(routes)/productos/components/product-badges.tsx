import { Badge } from "@/components/ui/badge";
import type { ProductShape, Readiness } from "@/lib/product-readiness";
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
  if (readiness.complete) return <ProductTintBadge label="Listo" tone="mint" />;
  return <ProductTintBadge label={`Faltan ${readiness.total - readiness.done}`} tone="cream" title={`Falta: ${readiness.missing.join(", ")}`} />;
}

export function StockBadge({ stock, isArchived }: { stock: number; isArchived: boolean }) {
  if (isArchived) return <ProductTintBadge label="Archivado" tone="slate" />;
  if (stock <= 0) return <ProductTintBadge label="Agotado" tone="pink" />;
  if (stock <= 5) return <ProductTintBadge label={`${stock} und`} tone="cream" title="Stock crítico" />;
  return <span className="text-sm font-semibold tabular-nums text-primary">{stock}</span>;
}
