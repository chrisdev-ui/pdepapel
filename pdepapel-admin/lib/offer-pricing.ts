import { resolveUnitPrice, type PriceTier, type ResolvedUnitPrice } from "@/lib/price-tiers";

/**
 * La regla del precio efectivo, pura: la usan el motor de ofertas de la
 * tienda (`discount-engine`), el cobro (`product-pricing.priceLines`) y el
 * copiloto, cada uno con sus propias consultas. Cambiar la regla aquí la
 * cambia en los tres.
 */
export interface PricedProduct {
  id: string;
  price: number;
  categoryId: string;
  productGroupId: string | null;
}

export interface ActiveOffer {
  id: string;
  label: string | null;
  type: "PERCENTAGE" | "FIXED";
  amount: number;
  products: { productId: string }[];
  categories: { categoryId: string }[];
  productGroups: { productGroupId: string }[];
}

export interface BestOffer {
  price: number;
  originalPrice: number;
  discount: number;
  offerLabel: string | null;
  matchedOfferId: string | null;
}

const appliesTo = (offer: ActiveOffer, product: PricedProduct) =>
  offer.products.some((row) => row.productId === product.id) ||
  offer.categories.some((row) => row.categoryId === product.categoryId) ||
  (product.productGroupId !== null && offer.productGroups.some((row) => row.productGroupId === product.productGroupId));

/**
 * La oferta vigente que deja el precio más bajo (por producto, categoría o
 * grupo). Entre dos que dejan el mismo precio gana la primera de la lista,
 * así que las ofertas deben venir ordenadas por fecha de creación.
 */
export function pickBestOffer(product: PricedProduct, offers: readonly ActiveOffer[]): BestOffer {
  let bestPrice = product.price;
  let best: ActiveOffer | null = null;
  for (const offer of offers) {
    if (!appliesTo(offer, product)) continue;
    const candidate = offer.type === "PERCENTAGE" ? product.price * (1 - offer.amount / 100) : offer.type === "FIXED" ? Math.max(0, product.price - offer.amount) : product.price;
    if (candidate < bestPrice) {
      bestPrice = candidate;
      best = offer;
    }
  }
  if (!best) return { price: product.price, originalPrice: product.price, discount: 0, offerLabel: null, matchedOfferId: null };
  // Sin etiqueta pública la tienda solo muestra el precio rebajado: el nombre interno nunca sale.
  return { price: bestPrice, originalPrice: product.price, discount: product.price - bestPrice, offerLabel: best.label || null, matchedOfferId: best.id };
}

/** Lista, mejor oferta y escalera por cantidad: gana el más bajo (como el cobro). */
export function effectiveUnitPrice(input: {
  product: PricedProduct;
  offer: BestOffer;
  tiers: readonly PriceTier[];
  quantity: number;
}): ResolvedUnitPrice {
  return resolveUnitPrice({
    basePrice: input.product.price,
    offerPrice: input.offer.discount > 0 ? input.offer.price : null,
    offerLabel: input.offer.offerLabel,
    tiers: [...input.tiers],
    quantity: input.quantity,
  });
}
