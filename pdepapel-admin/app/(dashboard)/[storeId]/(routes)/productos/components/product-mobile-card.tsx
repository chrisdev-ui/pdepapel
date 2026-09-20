import { useCanWrite } from "@/components/shell/viewer-access";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { getListReadiness, getProductShape } from "@/lib/product-readiness";
import { cn, currencyFormatter } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { CellAction } from "./cell-action";
import { ProductColumn, productImage } from "./columns";
import {
  FeaturedBadge,
  OfferBadge,
  ReadinessBadge,
  ShapeBadge,
  StockBadge,
} from "./product-badges";

interface ProductMobileCardProps {
  product: ProductColumn;
  storeId: string;
  lowStockThreshold?: number;
  storeUrl?: string | null;
  /** Modo selección: la tarjeta muestra su casilla para las acciones en lote. */
  selectable?: boolean;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
}

export function ProductMobileCard({
  product,
  storeId,
  lowStockThreshold,
  storeUrl,
  selectable = false,
  selected = false,
  onSelectedChange,
}: ProductMobileCardProps) {
  const canWrite = useCanWrite();
  return (
    <article
      className={cn(
        "flex gap-3 rounded-xl border bg-white p-3 shadow-sm",
        selected && "border-primary bg-accent/40",
      )}
    >
      {selectable && (
        <Checkbox
          className="mt-0.5"
          checked={selected}
          onCheckedChange={(checked) => onSelectedChange?.(checked === true)}
          aria-label={`Seleccionar ${product.name}`}
        />
      )}
      <Image
        src={productImage(product)}
        alt=""
        width={64}
        height={64}
        className="h-16 w-16 shrink-0 rounded-lg object-cover"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <Link
              href={`/${storeId}/productos/${product.id}`}
              className="truncate text-sm font-bold text-primary"
            >
              {product.name}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {product.sku}
              {product.productGroup ? (
                <>
                  {" · "}
                  <Link
                    href={`/${storeId}/productos/grupo/${product.productGroup.id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {product.productGroup.name} ›
                  </Link>
                </>
              ) : product.category?.name ? (
                ` · ${product.category.name}`
              ) : (
                ""
              )}
            </span>
          </div>
          <span className="flex shrink-0 flex-col items-end">
            <span className="whitespace-nowrap text-sm font-bold text-primary">
              {currencyFormatter(product.discountedPrice)}
            </span>
            {product.hasDiscount && (
              <span className="whitespace-nowrap text-[11px] text-muted-foreground line-through">
                {currencyFormatter(product.price)}
              </span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ShapeBadge shape={getProductShape(product)} />
          <StockBadge
            stock={product.stock}
            isArchived={product.isArchived}
            availableAt={product.availableAt}
            threshold={lowStockThreshold}
          />
          <ReadinessBadge readiness={getListReadiness(product)} />
          <FeaturedBadge isFeatured={product.isFeatured} />
          {product.hasDiscount && <OfferBadge label={product.offerLabel} />}
        </div>
        {!selectable && (
          <div className="flex items-center gap-2">
            <Button asChild variant="soft" size="sm" className="flex-1">
              <Link href={`/${storeId}/productos/${product.id}`}>{canWrite ? "Editar" : "Ver"}</Link>
            </Button>
            <CellAction data={product} storeUrl={storeUrl} />
          </div>
        )}
      </div>
    </article>
  );
}
