import { getLowStockLabel, isLowStock } from "@/components/ui/low-stock-notice";
import { formatArrivalDate, isComingSoon } from "@/lib/product-card";
import { Product } from "@/types";

export type ProductAvailabilityStatus =
  | "archived"
  | "presale"
  | "coming-soon"
  | "sold-out"
  | "low-stock"
  | "in-stock";

export interface ProductAvailability {
  status: ProductAvailabilityStatus;
  /** Se puede agregar al carrito ahora mismo. */
  canBuy: boolean;
  /** Texto del botón principal y de las barras fijas. */
  ctaLabel: string;
  /** Primera línea del bloque de señales. */
  stockLabel: string;
  tone: "green" | "amber" | "gray" | "purple" | "blue";
  /** Preventa: cuántas reservas quedan y cuándo llega. */
  presale?: { remaining: number; arrivalLabel: string } | null;
}

const STOCK_COUNT_LIMIT = 30;

/**
 * Un solo estado por producto, en el mismo orden de prioridad que las
 * etiquetas de las tarjetas: archivado → llega pronto → agotado → pocas
 * unidades → en stock.
 */
export function getProductAvailability(
  product: Pick<Product, "stock" | "isArchived" | "availableAt" | "isGroup" | "presales">,
  options: { earlyAccess?: boolean; now?: Date } = {},
): ProductAvailability {
  const now = options.now ?? new Date();

  if (product.isArchived) {
    return { status: "archived", canBuy: false, ctaLabel: "No disponible", stockLabel: "Este producto ya no está disponible para la venta", tone: "gray" };
  }
  // Preventa: se puede comprar hoy aunque no haya stock, contra el tope de la
  // campaña. Va ANTES de «llega pronto» porque la preventa es precisamente la
  // forma de comprarlo antes de que llegue.
  const presale = product.presales?.[0];
  if (presale) {
    const remaining = Math.max(0, presale.unitLimit - presale.committedUnits);
    const arrivalLabel = formatArrivalDate(presale.expectedArrivalAt);
    if (remaining > 0) {
      return {
        status: "presale",
        canBuy: true,
        ctaLabel: "Reservar ahora",
        stockLabel: `Preventa · llega el ${arrivalLabel}`,
        tone: "blue",
        presale: { remaining, arrivalLabel },
      };
    }
    // Se llenó el cupo: deja de venderse y vuelve a ser un «llega pronto».
    return {
      status: "coming-soon",
      canBuy: false,
      ctaLabel: "Avísame cuando llegue",
      stockLabel: `Reservas agotadas · llega el ${arrivalLabel}`,
      tone: "purple",
      presale: { remaining: 0, arrivalLabel },
    };
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
