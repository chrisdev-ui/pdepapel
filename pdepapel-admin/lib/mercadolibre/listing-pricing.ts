export type MercadoLibreListingPriceEstimate = {
  saleFeeAmount: number;
  percentageFee: number | null;
  fixedFee: number | null;
  financingAddOnFee: number | null;
  listingFeeAmount: number | null;
  listingTypeId: string | null;
  listingTypeName: string | null;
  listingExposure: string | null;
  installmentCount: number | null;
  installmentLabel: string | null;
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

export function getMercadoLibreInstallmentTerms(
  siteId: string,
  listingTypeId: string | null,
) {
  if (siteId.toUpperCase() !== "MCO") {
    return { installmentCount: null, installmentLabel: null };
  }

  if (listingTypeId === "gold_special") {
    return {
      installmentCount: 3,
      installmentLabel: "Hasta 3 cuotas con 0% interés",
    };
  }

  if (listingTypeId === "gold_pro") {
    return {
      installmentCount: 6,
      installmentLabel: "Hasta 6 cuotas con 0% interés",
    };
  }

  return { installmentCount: null, installmentLabel: null };
}

function parsePriceEstimateRecord(
  data: Record<string, unknown> | null,
): MercadoLibreListingPriceEstimate | null {
  const feeDetails = asRecord(data?.sale_fee_details);
  const saleFeeAmount = getNumber(data?.sale_fee_amount);
  if (saleFeeAmount === null) return null;

  return {
    saleFeeAmount,
    percentageFee: getNumber(feeDetails?.percentage_fee),
    fixedFee: getNumber(feeDetails?.fixed_fee),
    financingAddOnFee: getNumber(feeDetails?.financing_add_on_fee),
    listingFeeAmount: getNumber(data?.listing_fee_amount),
    listingTypeId: getString(data?.listing_type_id),
    listingTypeName: getString(data?.listing_type_name),
    listingExposure: getString(data?.listing_exposure),
    installmentCount: null,
    installmentLabel: null,
  };
}

export function addMercadoLibreInstallmentTerms(
  estimate: MercadoLibreListingPriceEstimate,
  siteId: string,
): MercadoLibreListingPriceEstimate {
  return {
    ...estimate,
    ...getMercadoLibreInstallmentTerms(siteId, estimate.listingTypeId),
  };
}

export function parseMercadoLibreListingPriceEstimates(
  payload: unknown,
): MercadoLibreListingPriceEstimate[] {
  const values = Array.isArray(payload) ? payload : [payload];
  return values.flatMap((value) => {
    const estimate = parsePriceEstimateRecord(asRecord(value));
    return estimate ? [estimate] : [];
  });
}

export function parseMercadoLibreListingPriceEstimate(
  payload: unknown,
): MercadoLibreListingPriceEstimate | null {
  return parseMercadoLibreListingPriceEstimates(payload)[0] ?? null;
}
