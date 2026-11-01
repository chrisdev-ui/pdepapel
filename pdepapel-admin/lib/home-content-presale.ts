import "server-only";

import type { HomeContentRow, PresaleCampaignOffer, PresaleOfferFor } from "@/lib/home-content";
import { presaleCampaignProductIds } from "@/lib/home-content";
import { MIN_ONLINE_INSTALLMENT } from "@/lib/preorder-online-rules";
import { getActivePresalesByProduct, getPresaleCapacity } from "@/lib/presale";
import { presaleUnitDeposit } from "@/lib/presale-deposit";

type ActivePresale = Awaited<ReturnType<typeof getActivePresalesByProduct>> extends Map<string, infer V> ? V : never;

/**
 * Los números del banner de preventa, de las mismas reglas que cobra el
 * checkout: el anticipo de `presaleUnitDeposit` y el abono mínimo de
 * `MIN_ONLINE_INSTALLMENT`. La tienda solo los formatea. Null si la campaña no
 * debe verse: producto archivado, sin preventa activa o con el cupo lleno.
 */
export function presaleCampaignOffer(
  entry: HomeContentRow,
  presales: Map<string, Pick<ActivePresale, "unitLimit" | "committedUnits" | "heldUnits" | "paymentMode" | "depositType" | "depositValue">>,
): PresaleCampaignOffer | null {
  const product = entry.products[0]?.product;
  if (!product || product.isArchived) return null;
  const presale = presales.get(product.id);
  if (!presale) return null;
  if (getPresaleCapacity(presale).remaining === 0) return null;
  const price = Number(product.price);
  const isDeposit = presale.paymentMode === "DEPOSIT";
  const depositPerUnit = isDeposit ? presaleUnitDeposit(presale, price) : price;
  const balance = Math.max(0, price - depositPerUnit);
  return {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    price,
    paymentMode: presale.paymentMode,
    depositPerUnit,
    minInstallment: isDeposit && balance > 0 ? Math.min(MIN_ONLINE_INSTALLMENT, balance) : null,
    imageUrl: product.images[0]?.url ?? null,
  };
}

/** Carga las preventas activas de las campañas de preventa y devuelve con qué armar cada banner. */
export async function loadPresaleOffers(storeId: string, entries: HomeContentRow[], now: Date): Promise<PresaleOfferFor> {
  const productIds = presaleCampaignProductIds(entries);
  if (productIds.length === 0) return () => null;
  const presales = await getActivePresalesByProduct(storeId, productIds, { now });
  return (entry) => presaleCampaignOffer(entry, presales);
}
