export type MercadoLibreListingFeeQuote = {
  saleFeeAmount: number;
  percentageFee?: number | null;
  fixedFee?: number | null;
};

type PriceRecommendationInput = {
  acquisitionCost: number | null;
  targetProfit: number | null;
  initialPrice: number;
  additionalCosts?: number;
  getFeeQuote: (price: number) => Promise<MercadoLibreListingFeeQuote>;
};

export type MercadoLibreListingPriceRecommendation = {
  price: number;
  saleFeeAmount: number;
  expectedProfit: number;
};

function toPositiveInteger(value: number) {
  return Math.max(1, Math.ceil(value));
}

export async function recommendMercadoLibreListingPrice({
  acquisitionCost,
  targetProfit,
  initialPrice,
  additionalCosts = 0,
  getFeeQuote,
}: PriceRecommendationInput): Promise<MercadoLibreListingPriceRecommendation | null> {
  if (
    acquisitionCost === null ||
    !Number.isFinite(acquisitionCost) ||
    acquisitionCost < 0 ||
    targetProfit === null ||
    !Number.isFinite(targetProfit) ||
    targetProfit < 0 ||
    !Number.isFinite(additionalCosts) ||
    additionalCosts < 0
  ) {
    return null;
  }

  const requiredNetAmount = acquisitionCost + targetProfit + additionalCosts;
  let price = toPositiveInteger(Math.max(initialPrice, requiredNetAmount));
  let quote: MercadoLibreListingFeeQuote | null = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    quote = await getFeeQuote(price);
    const percentageFee = quote.percentageFee ?? null;
    const fixedFee = quote.fixedFee ?? 0;
    const percentageMultiplier =
      percentageFee !== null && percentageFee >= 0 && percentageFee < 100
        ? 1 - percentageFee / 100
        : null;
    const priceFromPercentage = percentageMultiplier
      ? toPositiveInteger((requiredNetAmount + fixedFee) / percentageMultiplier)
      : 0;
    const nextPrice = Math.max(
      price,
      toPositiveInteger(requiredNetAmount + quote.saleFeeAmount),
      priceFromPercentage,
    );
    if (nextPrice <= price) {
      return {
        price,
        saleFeeAmount: quote.saleFeeAmount,
        expectedProfit:
          price - quote.saleFeeAmount - acquisitionCost - additionalCosts,
      };
    }
    price = nextPrice;
  }

  if (!quote) return null;
  const finalQuote = await getFeeQuote(price);
  return {
    price,
    saleFeeAmount: finalQuote.saleFeeAmount,
    expectedProfit:
      price - finalQuote.saleFeeAmount - acquisitionCost - additionalCosts,
  };
}
