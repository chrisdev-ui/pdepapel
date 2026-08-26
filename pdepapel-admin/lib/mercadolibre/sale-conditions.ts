export type MercadoLibreRemoteSaleConditions = {
  listingType: string;
  categoryId: string;
  price: number;
  shippingMode: string | null;
  logisticType: string | null;
  freeShipping: boolean;
  localPickUp: boolean;
  tags: string[];
  mandatoryFreeShipping: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.flatMap((item) => {
        const normalized = getString(item);
        return normalized ? [normalized] : [];
      }),
    ),
  );
}

export function parseMercadoLibreRemoteSaleConditions(
  payload: unknown,
): MercadoLibreRemoteSaleConditions | null {
  const item = asRecord(payload);
  const shipping = asRecord(item?.shipping);
  const listingType = getString(item?.listing_type_id);
  const categoryId = getString(item?.category_id);
  const price = getPositiveNumber(item?.price);
  if (!listingType || !categoryId || price === null || !shipping) return null;

  const tags = getStringArray(shipping.tags);

  return {
    listingType,
    categoryId,
    price,
    shippingMode: getString(shipping.mode),
    logisticType: getString(shipping.logistic_type),
    freeShipping: shipping.free_shipping === true,
    localPickUp: shipping.local_pick_up === true,
    tags,
    mandatoryFreeShipping: tags.includes("mandatory_free_shipping"),
  };
}

export function parseMercadoLibreAvailableListingTypes(payload: unknown) {
  if (!Array.isArray(payload)) return [];

  return Array.from(
    new Set(
      payload.flatMap((value) => {
        if (typeof value === "string" && value.trim()) return [value.trim()];
        const id = getString(asRecord(value)?.id);
        return id ? [id] : [];
      }),
    ),
  );
}
