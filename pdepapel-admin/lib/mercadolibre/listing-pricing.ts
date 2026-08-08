export type MercadoLibreListingPriceEstimate = {
  saleFeeAmount: number;
  percentageFee: number | null;
  fixedFee: number | null;
  listingTypeId: string | null;
  listingTypeName: string | null;
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

export function parseMercadoLibreListingPriceEstimate(
  payload: unknown,
): MercadoLibreListingPriceEstimate | null {
  const data = Array.isArray(payload)
    ? asRecord(payload[0])
    : asRecord(payload);
  const feeDetails = asRecord(data?.sale_fee_details);
  const saleFeeAmount = getNumber(data?.sale_fee_amount);
  if (saleFeeAmount === null) return null;

  return {
    saleFeeAmount,
    percentageFee: getNumber(feeDetails?.percentage_fee),
    fixedFee: getNumber(feeDetails?.fixed_fee),
    listingTypeId: getString(data?.listing_type_id),
    listingTypeName: getString(data?.listing_type_name),
  };
}
