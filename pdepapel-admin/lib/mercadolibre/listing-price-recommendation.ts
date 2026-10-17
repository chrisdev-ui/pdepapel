import {
  feeSourceFromQuote,
  mercadoLibreNetAt,
  suggestMercadoLibrePriceWithRule,
  type LowPriceRule,
  type SaleFeeSource,
} from "@/lib/pricing/mercadolibre-fees";

export type MercadoLibreListingFeeQuote = {
  saleFeeAmount: number;
  percentageFee?: number | null;
  fixedFee?: number | null;
  /** Costo fijo de publicar (algunos tipos lo cobran); también sale del neto. */
  listingFeeAmount?: number | null;
  listingTypeId?: string | null;
};

type PriceRecommendationInput = {
  /** Costo de compra + envío por unidad. */
  unitCost: number | null;
  targetProfit: number | null;
  initialPrice: number;
  listingType: string | null;
  rule: LowPriceRule;
  /** Envío que paga la tienda por encima del precio límite; sin él, el estimado del módulo compartido. */
  shippingCost?: number;
  getFeeQuote: (price: number) => Promise<MercadoLibreListingFeeQuote>;
};

export type MercadoLibreListingPriceRecommendation = {
  price: number;
  saleFeeAmount: number;
  expectedProfit: number;
};

const MAX_QUOTE_ROUNDS = 3;

/**
 * El menor precio terminado en 900 que deja la ganancia objetivo, con la
 * misma regla que el Copiloto y el asistente de publicación
 * (`lib/pricing/mercadolibre-fees.ts`): comisión de `listing_prices` (o la del
 * tipo de publicación si no responde), cargo fijo en vez del envío hasta el
 * precio límite, envío por encima y la retención estimada. La comisión se
 * vuelve a pedir al precio sugerido, por si cambia de tramo.
 */
export async function recommendMercadoLibreListingPrice({
  unitCost,
  targetProfit,
  initialPrice,
  listingType,
  rule,
  shippingCost,
  getFeeQuote,
}: PriceRecommendationInput): Promise<MercadoLibreListingPriceRecommendation | null> {
  if (unitCost === null || !Number.isFinite(unitCost) || unitCost < 0 || targetProfit === null || !Number.isFinite(targetProfit) || targetProfit < 0) {
    return null;
  }

  let quotedAt = Math.max(1, Math.round(initialPrice));
  let quote = await getFeeQuote(quotedAt);
  let price: number | null = null;
  for (let round = 0; round < MAX_QUOTE_ROUNDS; round += 1) {
    const fee: SaleFeeSource = feeSourceFromQuote({ ...quote, listingTypeId: quote.listingTypeId ?? listingType }, quotedAt) ?? { kind: "tipo", listingType };
    const listingFee = Math.max(0, quote.listingFeeAmount ?? 0);
    price = suggestMercadoLibrePriceWithRule({
      unitCost: unitCost + listingFee,
      fee,
      rule,
      shippingCost,
      targets: { targetNet: targetProfit, targetMarginRate: 0 },
    });
    if (price === null || price === quotedAt) break;
    quotedAt = price;
    quote = await getFeeQuote(price);
  }
  if (price === null) return null;

  const fee: SaleFeeSource = feeSourceFromQuote({ ...quote, listingTypeId: quote.listingTypeId ?? listingType }, quotedAt) ?? { kind: "tipo", listingType };
  const estimate = mercadoLibreNetAt({ price, unitCost: unitCost + Math.max(0, quote.listingFeeAmount ?? 0), fee, rule, shippingCost });
  return { price, saleFeeAmount: estimate.commission, expectedProfit: estimate.net ?? 0 };
}
