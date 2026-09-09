import { currencyFormatter } from "@/lib/utils";
import { Product } from "@/types";

// Reglas de la tarjeta de producto: cada dato tiene un solo lugar y las
// insignias ocupan como máximo dos ranuras (comercial y catálogo).

export const NEW_PRODUCT_DAYS = 30;
export const LOW_STOCK_THRESHOLD = 3;

export type CardBadgeTone = "soldOut" | "comingSoon" | "offer" | "options" | "new";

export interface CardBadge {
  text: string;
  tone: CardBadgeTone;
}

export interface CardBadges {
  /** Ranura A (comercial): próximamente > agotado > oferta. */
  commercial: CardBadge | null;
  /** Ranura B (catálogo): opciones > nuevo. */
  catalog: CardBadge | null;
  /** «Nuevo» cede la ranura B a «opciones» y pasa a la línea de categoría. */
  newInline: boolean;
}

export function isComingSoon(product: Pick<Product, "availableAt">, now: Date = new Date()): boolean {
  if (!product.availableAt) return false;
  return new Date(product.availableAt).getTime() > now.getTime();
}

export function formatArrivalDate(value: string | Date): string {
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" })
    .format(new Date(value))
    .replace(".", "");
}

export function isRecentlyCreated(product: Pick<Product, "createdAt">, now: Date = new Date()): boolean {
  if (!product.createdAt) return false;
  const created = new Date(product.createdAt).getTime();
  return now.getTime() - created <= NEW_PRODUCT_DAYS * 24 * 60 * 60 * 1000;
}

export function getDiscountPercent(product: Pick<Product, "price" | "originalPrice" | "minPrice" | "isGroup">): number | null {
  const current = product.isGroup && product.minPrice ? product.minPrice : Number(product.price);
  const original = Number(product.originalPrice ?? 0);
  if (!original || !current || current >= original) return null;
  return Math.round(((original - current) / original) * 100);
}

export function getProductCardBadges(
  product: Pick<Product, "stock" | "isGroup" | "hasDiscount" | "offerLabel" | "variantCount" | "availableAt" | "price" | "originalPrice" | "minPrice">,
  options: { isNew?: boolean; now?: Date } = {},
): CardBadges {
  const now = options.now ?? new Date();
  const percent = getDiscountPercent(product);
  const onOffer = Boolean(product.offerLabel) || Boolean(product.hasDiscount) || percent !== null;

  let commercial: CardBadge | null = null;
  if (isComingSoon(product, now)) {
    commercial = { text: `Llega el ${formatArrivalDate(product.availableAt!)}`, tone: "comingSoon" };
  } else if (product.stock === 0) {
    commercial = { text: "Agotado", tone: "soldOut" };
  } else if (onOffer) {
    const text = product.isGroup ? "Opciones en oferta" : percent ? `${percent} % OFF` : product.offerLabel || "Oferta";
    commercial = { text, tone: "offer" };
  }

  const hasOptions = Boolean(product.isGroup) && (product.variantCount ?? 0) > 0;
  const catalog: CardBadge | null = hasOptions
    ? { text: `${product.variantCount} opciones`, tone: "options" }
    : options.isNew
      ? { text: "¡Nuevo!", tone: "new" }
      : null;

  return { commercial, catalog, newInline: Boolean(options.isNew) && hasOptions };
}

export interface CardPrice {
  prefix: string | null;
  current: string;
  original: string | null;
  savings: string | null;
  percent: number | null;
}

export function getProductCardPrice(
  product: Pick<Product, "price" | "originalPrice" | "minPrice" | "maxPrice" | "isGroup" | "hasDiscount">,
): CardPrice {
  const format = (value: number) => currencyFormatter.format(value);
  const percent = getDiscountPercent(product);

  if (product.isGroup) {
    const min = product.minPrice ?? Number(product.price);
    const max = product.maxPrice ?? min;
    const ranged = min !== max;
    const original = !ranged && product.originalPrice && min < product.originalPrice ? product.originalPrice : null;
    return {
      prefix: ranged || product.hasDiscount ? "Desde" : null,
      current: format(min),
      original: original ? format(original) : null,
      savings: original ? `Ahorra ${format(original - min)}` : null,
      percent,
    };
  }

  const current = Number(product.price);
  const original = product.originalPrice && product.originalPrice > current ? product.originalPrice : null;
  return {
    prefix: null,
    current: format(current),
    original: original ? format(original) : null,
    savings: original ? `Ahorra ${format(original - current)}` : null,
    percent,
  };
}

export function isLowStock(product: Pick<Product, "stock" | "isGroup">): boolean {
  return !product.isGroup && product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD;
}

export function getAverageRating(reviews: { rating: number }[] | undefined): { average: number; count: number } | null {
  if (!reviews || reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0);
  return { average: Math.round((total / reviews.length) * 10) / 10, count: reviews.length };
}
