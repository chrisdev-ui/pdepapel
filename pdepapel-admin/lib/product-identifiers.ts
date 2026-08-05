const GTIN_PATTERN = /^(\d{8}|\d{12,14})$/;
const MAX_MPN_LENGTH = 70;

type ProductIdentifiersInput = {
  gtin?: unknown;
  mpn?: unknown;
  hasNoProductIdentifier?: unknown;
};

export function normalizeProductIdentifiers({
  gtin,
  mpn,
  hasNoProductIdentifier,
}: ProductIdentifiersInput) {
  const normalizedGtin = typeof gtin === "string" ? gtin.trim() : "";
  const normalizedMpn = typeof mpn === "string" ? mpn.trim() : "";
  const hasNoIdentifier = Boolean(hasNoProductIdentifier);

  if (normalizedGtin && !GTIN_PATTERN.test(normalizedGtin)) {
    throw new Error("El GTIN debe tener 8, 12, 13 o 14 dígitos");
  }
  if (normalizedMpn.length > MAX_MPN_LENGTH) {
    throw new Error("La referencia del fabricante no puede superar 70 caracteres");
  }

  return {
    gtin: hasNoIdentifier ? null : normalizedGtin || null,
    mpn: hasNoIdentifier ? null : normalizedMpn || null,
    hasNoProductIdentifier: hasNoIdentifier,
  };
}
