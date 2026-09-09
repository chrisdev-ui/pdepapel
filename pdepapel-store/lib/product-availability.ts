import { getLowStockLabel, isLowStock } from "@/components/ui/low-stock-notice";
import { formatArrivalDate, isComingSoon } from "@/lib/product-card";
import { Product } from "@/types";

export type ProductAvailabilityStatus = "archived" | "coming-soon" | "sold-out" | "low-stock" | "in-stock";

export interface ProductAvailability {
  status: ProductAvailabilityStatus;
  /** Se puede agregar al carrito ahora mismo. */
  canBuy: boolean;
  /** Texto del botón principal y de las barras fijas. */
  ctaLabel: string;
  /** Primera línea del bloque de señales. */
  stockLabel: string;
  tone: "green" | "amber" | "gray" | "purple";
}

const STOCK_COUNT_LIMIT = 30;

/**
 * Un solo estado por producto, en el mismo orden de prioridad que las
 * etiquetas de las tarjetas: archivado → llega pronto → agotado → pocas
 * unidades → en stock.
 */
export function getProductAvailability(
  product: Pick<Product, "stock" | "isArchived" | "availableAt" | "isGroup">,
  options: { earlyAccess?: boolean; now?: Date } = {},
): ProductAvailability {
  const now = options.now ?? new Date();

  if (product.isArchived) {
    return { status: "archived", canBuy: false, ctaLabel: "No disponible", stockLabel: "Este producto ya no está disponible para la venta", tone: "gray" };
  }
  if (isComingSoon(product, now) && !options.earlyAccess) {
    return {
      status: "coming-soon",
      canBuy: false,
      ctaLabel: "Avísame cuando llegue",
      stockLabel: product.availableAt ? `Llega el ${formatArrivalDate(product.availableAt)}` : "Llega pronto",
      tone: "purple",
    };
  }
  if (product.stock <= 0) {
    return { status: "sold-out", canBuy: false, ctaLabel: "Avísame cuando vuelva", stockLabel: "Agotado por ahora", tone: "gray" };
  }
  if (!product.isGroup && isLowStock(product.stock)) {
    return { status: "low-stock", canBuy: true, ctaLabel: "Agregar al carrito", stockLabel: getLowStockLabel(product.stock, "detail"), tone: "amber" };
  }
  const stockLabel = product.isGroup
    ? "Disponible en varias opciones"
    : product.stock <= STOCK_COUNT_LIMIT
      ? `En stock · quedan ${product.stock} unidades`
      : "En stock";
  return { status: "in-stock", canBuy: true, ctaLabel: "Agregar al carrito", stockLabel, tone: "green" };
}
