import type { Product } from "@prisma/client";

/**
 * Precio de un producto tal como lo deben anunciar los feeds de Google
 * Merchant y Meta. Sale del mismo motor de descuentos que usa la API de la
 * tienda (`calculateDiscountedPrice`), cuyo resultado termina en el
 * `offers.price` del JSON-LD de la ficha. Si el feed anuncia el precio base
 * mientras la ficha muestra el rebajado, Merchant rechaza el producto por
 * «precio no coincide».
 */
export type FeedPricing = {
  /** Precio normal, sin oferta. */
  price: number;
  /** Precio con la mejor oferta vigente; null sin oferta. */
  salePrice: number | null;
  /** Vigencia de la oferta en ISO 8601 («inicio/fin»); null sin oferta. */
  salePriceEffectiveDate: string | null;
};

export type FeedPricingInput = {
  /** Precio efectivo que devuelve el motor de descuentos. */
  price: number;
  discount: number;
  offer?: { startDate: Date | string; endDate: Date | string } | null;
};

type PricedProduct = Pick<Product, "id" | "price">;

export function getFeedPricing(
  product: PricedProduct,
  input?: FeedPricingInput | null,
): FeedPricing {
  const hasSale = Boolean(input && input.discount > 0 && input.price < product.price);
  if (!input || !hasSale) {
    return { price: product.price, salePrice: null, salePriceEffectiveDate: null };
  }

  const effectiveDate = input.offer
    ? `${new Date(input.offer.startDate).toISOString()}/${new Date(input.offer.endDate).toISOString()}`
    : null;

  return {
    price: product.price,
    salePrice: input.price,
    salePriceEffectiveDate: effectiveDate,
  };
}

/**
 * Precios de feed para un lote de productos: una sola lectura de ofertas
 * vigentes (con caché en Redis) y el mismo cálculo que la tienda.
 */
export async function getFeedPricingMap(
  storeId: string,
  products: Pick<Product, "id" | "categoryId" | "price" | "productGroupId">[],
): Promise<Map<string, FeedPricingInput>> {
  // Import diferido: el motor abre Redis al cargarse y los constructores de
  // feed (puros) no deben depender de eso.
  const { getActiveOffers, getProductsPrices } = await import("@/lib/discount-engine");
  const [prices, offers] = await Promise.all([
    getProductsPrices(products, storeId),
    getActiveOffers(storeId),
  ]);
  const offersById = new Map<string, { startDate: Date | string; endDate: Date | string }>(
    offers.map((offer: { id: string; startDate: Date | string; endDate: Date | string }) => [
      offer.id,
      { startDate: offer.startDate, endDate: offer.endDate },
    ]),
  );

  const result = new Map<string, FeedPricingInput>();
  prices.forEach((priced, productId) => {
    result.set(productId, {
      price: priced.price,
      discount: priced.discount,
      offer: priced.matchedOfferId ? offersById.get(priced.matchedOfferId) ?? null : null,
    });
  });
  return result;
}
