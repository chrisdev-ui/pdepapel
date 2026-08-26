export type MercadoLibreShippingCostEstimate = {
  sellerCost: number;
  currencyId: string | null;
  billableWeightGrams: number | null;
  discountRate: number | null;
  promotedAmount: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseMercadoLibreShippingCostEstimate(
  payload: unknown,
): MercadoLibreShippingCostEstimate | null {
  const root = asRecord(payload);
  const coverage = asRecord(root?.coverage);
  const allCountry = asRecord(coverage?.all_country);
  const discount = asRecord(allCountry?.discount);
  const sellerCost = getNumber(allCountry?.list_cost);
  if (sellerCost === null) return null;

  return {
    sellerCost,
    currencyId: getString(allCountry?.currency_id),
    billableWeightGrams: getNumber(allCountry?.billable_weight),
    discountRate: getNumber(discount?.rate),
    promotedAmount: getNumber(discount?.promoted_amount),
  };
}
