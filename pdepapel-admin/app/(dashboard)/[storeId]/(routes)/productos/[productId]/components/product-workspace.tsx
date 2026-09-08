import { Button } from "@/components/ui/button";
import { getProductReadiness, getProductShape } from "@/lib/product-readiness";
import { cn, currencyFormatter } from "@/lib/utils";
import { AlertTriangle, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { ProductTintBadge, ShapeBadge } from "../../components/product-badges";

interface WorkspaceProduct {
  id: string;
  name: string;
  sku?: string | null;
  slug?: string | null;
  price: number;
  acqPrice?: number | null;
  stock: number;
  isArchived: boolean;
  isKit?: boolean | null;
  productGroupId?: string | null;
  categoryId?: string | null;
  gtin?: string | null;
  hasNoProductIdentifier?: boolean | null;
  description?: string | null;
  images: { url: string }[];
}

const SECTIONS = [
  { id: "imagenes", label: "Imágenes" },
  { id: "informacion", label: "Información básica" },
  { id: "precio", label: "Precio y margen" },
  { id: "inventario", label: "Inventario" },
  { id: "identificadores", label: "Identificadores" },
  { id: "clasificacion", label: "Clasificación y atributos" },
  { id: "visibilidad", label: "Visibilidad" },
  { id: "descripcion", label: "Descripción" },
];

export function ProductWorkspaceHeader({ product, storeUrl }: { product: WorkspaceProduct; storeUrl?: string }) {
  const shape = getProductShape(product);
  const readiness = getProductReadiness(product);
  const margin = product.acqPrice && product.price ? Math.round(((product.price - product.acqPrice) / product.price) * 100) : null;
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="truncate text-2xl font-bold tracking-tight text-primary">{product.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ProductTintBadge label={product.isArchived ? "Archivado" : "Activo en la tienda"} tone={product.isArchived ? "slate" : "mint"} />
          <ShapeBadge shape={shape} />
          {product.sku && <ProductTintBadge label={`SKU ${product.sku}`} tone="slate" />}
          <span className="text-xs text-muted-foreground">
            {currencyFormatter(product.price)}
            {margin !== null ? ` · margen ${margin} %` : ""} · stock {product.stock}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {storeUrl && product.slug && !product.isArchived && (
          <Button asChild variant="outline" size="sm">
            <a href={`${storeUrl.replace(/\/$/, "")}/producto/${product.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Ver en la tienda
            </a>
          </Button>
        )}
        {!readiness.complete && (
          <ProductTintBadge label={`Faltan ${readiness.total - readiness.done} para vender`} tone="cream" />
        )}
      </div>
    </div>
  );
}

export function ProductWorkspaceAside({ product, storeId }: { product: WorkspaceProduct | null; storeId: string }) {
  const readiness = product ? getProductReadiness(product) : null;
  return (
    <aside className="flex flex-col gap-4 xl:sticky xl:top-4">
      <nav aria-label="Secciones del producto" className="rounded-xl border bg-white p-2 shadow-sm">
        <ul className="flex flex-col gap-0.5">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-primary hover:bg-accent">
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      {readiness && (
        <section aria-labelledby="listo-titulo" className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 id="listo-titulo" className="text-sm font-bold text-primary">Listo para vender</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold text-primary", readiness.complete ? "bg-tint-mint" : "bg-tint-cream")}>
              {readiness.done} de {readiness.total}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {readiness.checks.map((check) => (
              <li key={check.id} className="flex items-start gap-2 text-[13px]">
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary", check.ok ? "bg-tint-mint" : "bg-tint-cream")} aria-hidden="true">
                  {check.ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                </span>
                <span className="flex flex-col">
                  <span className={cn(!check.ok && "font-semibold text-primary")}>{check.label}</span>
                  {!check.ok && check.hint && <span className="text-xs text-muted-foreground">{check.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Google Merchant necesita imagen, precio e identificador para mostrarlo.</p>
        </section>
      )}
      {product && (
        <Link href={`/${storeId}/movimientos-inventario`} className="text-[13px] font-semibold text-primary hover:underline">
          Ver movimientos de inventario
        </Link>
      )}
    </aside>
  );
}
