import type { CopilotDb } from "@/lib/copiloto/db";
import { effectiveUnitPrice, pickBestOffer, type ActiveOffer } from "@/lib/offer-pricing";

/**
 * Precio efectivo de una unidad (lista, mejor oferta vigente y escalera por
 * cantidad), con la misma regla que la tienda y el checkout. Lo usan
 * `kitsParaRotar` y `precioDeKit`.
 */
export async function loadEffectivePricing(db: CopilotDb, storeId: string, now: Date, productIds?: string[]) {
  const [offers, tiers] = await Promise.all([
    db.offer.findMany({
      where: { storeId, isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        label: true,
        type: true,
        amount: true,
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
        productGroups: { select: { productGroupId: true } },
      },
    }),
    db.productPriceTier.findMany({
      where: productIds ? { storeId, productId: { in: productIds } } : { storeId },
      select: { productId: true, minQuantity: true, unitPrice: true },
    }),
  ]);
  const tiersByProduct = new Map<string, { minQuantity: number; unitPrice: number }[]>();
  for (const tier of tiers) tiersByProduct.set(tier.productId, [...(tiersByProduct.get(tier.productId) ?? []), { minQuantity: tier.minQuantity, unitPrice: tier.unitPrice }]);

  return (product: { id: string; price: number; categoryId: string; productGroupId: string | null }) => {
    const priced = { id: product.id, price: product.price, categoryId: product.categoryId, productGroupId: product.productGroupId };
    const offer = pickBestOffer(priced, offers as ActiveOffer[]);
    return effectiveUnitPrice({ product: priced, offer, tiers: tiersByProduct.get(product.id) ?? [], quantity: 1 });
  };
}
