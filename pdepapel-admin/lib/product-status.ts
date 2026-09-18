import { isComingSoon, formatAvailableAt } from "@/lib/product-availability";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  isLowStock,
  isOutOfStock,
} from "@/lib/product-readiness";

/**
 * Estado de un producto en la tienda, en un solo sitio (como PROMOTION_STATUS
 * para ofertas y cupones): etiqueta y tono para la lista, la tarjeta y la ficha.
 */
export type ProductStatus =
  | "archivado"
  | "proximamente"
  | "agotado"
  | "stock-critico"
  | "a-la-venta";

export const PRODUCT_STATUS: Record<
  ProductStatus,
  {
    label: string;
    tone: "mint" | "sky" | "cream" | "slate" | "pink" | "lavender";
  }
> = {
  "a-la-venta": { label: "A la venta", tone: "mint" },
  "stock-critico": { label: "Stock crítico", tone: "cream" },
  agotado: { label: "Agotado", tone: "pink" },
  proximamente: { label: "Próximamente", tone: "lavender" },
  archivado: { label: "Archivado", tone: "slate" },
};

export interface ProductStatusInput {
  isArchived: boolean;
  stock: number;
  availableAt?: Date | string | null;
}

export function getProductStatus(
  product: ProductStatusInput,
  threshold = DEFAULT_LOW_STOCK_THRESHOLD,
): ProductStatus {
  if (product.isArchived) return "archivado";
  if (product.availableAt && isComingSoon({ availableAt: product.availableAt }))
    return "proximamente";
  if (isOutOfStock(product.stock)) return "agotado";
  if (isLowStock(product.stock, threshold)) return "stock-critico";
  return "a-la-venta";
}

/** Texto de la insignia de stock: el número siempre se ve, también archivado. */
export function productStockLabel(
  product: ProductStatusInput,
  threshold = DEFAULT_LOW_STOCK_THRESHOLD,
): string {
  const status = getProductStatus(product, threshold);
  const units = `${product.stock} und`;
  switch (status) {
    case "archivado":
      return `Archivado · ${units}`;
    case "proximamente":
      return `Llega el ${formatAvailableAt(product.availableAt!)}`;
    case "agotado":
      return "Agotado";
    default:
      return units;
  }
}
