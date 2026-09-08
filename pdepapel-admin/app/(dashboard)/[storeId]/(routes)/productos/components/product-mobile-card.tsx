import { Button } from "@/components/ui/button";
import { getListReadiness, getProductShape } from "@/lib/product-readiness";
import { currencyFormatter } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { CellAction } from "./cell-action";
import { ProductColumn, productImage } from "./columns";
import { ReadinessBadge, ShapeBadge, StockBadge } from "./product-badges";

export function ProductMobileCard({ product, storeId }: { product: ProductColumn; storeId: string }) {
  return (
    <article className="flex gap-3 rounded-xl border bg-white p-3 shadow-sm">
      <Image src={productImage(product)} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-lg object-cover" unoptimized />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <Link href={`/${storeId}/productos/${product.id}`} className="truncate text-sm font-bold text-primary">{product.name}</Link>
            <span className="truncate text-xs text-muted-foreground">{product.sku}{product.category?.name ? ` · ${product.category.name}` : ""}</span>
          </div>
          <span className="whitespace-nowrap text-sm font-bold text-primary">{currencyFormatter(product.discountedPrice)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ShapeBadge shape={getProductShape(product)} />
          <StockBadge stock={product.stock} isArchived={product.isArchived} />
          <ReadinessBadge readiness={getListReadiness(product)} />
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="soft" size="sm" className="flex-1">
            <Link href={`/${storeId}/productos/${product.id}`}>Editar</Link>
          </Button>
          <CellAction data={product} />
        </div>
      </div>
    </article>
  );
}
