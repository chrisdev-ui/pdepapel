const GTIN_PATTERN = /^(\d{8}|\d{12,14})$/;
const MAX_MPN_LENGTH = 70;

type ProductIdentifiersInput = {
  gtin?: unknown;
  mpn?: unknown;
  hasNoProductIdentifier?: unknown;
  /**
   * Al crear un producto: si no llega la marca y tampoco llega GTIN ni MPN,
   * el producto nace marcado «No tiene identificador global» (2026-09). La
   * mayoría del catálogo no tiene código de barras del fabricante; quien sí lo
   * tenga desmarca la casilla y escribe el GTIN real.
   */
  defaultNoIdentifierWhenEmpty?: boolean;
};

export function normalizeProductIdentifiers({
  gtin,
  mpn,
  hasNoProductIdentifier,
  defaultNoIdentifierWhenEmpty = false,
}: ProductIdentifiersInput) {
  const normalizedGtin = typeof gtin === "string" ? gtin.trim() : "";
  const normalizedMpn = typeof mpn === "string" ? mpn.trim() : "";
  const flagProvided = hasNoProductIdentifier !== undefined && hasNoProductIdentifier !== null;
  const hasNoIdentifier = flagProvided
    ? Boolean(hasNoProductIdentifier)
    : defaultNoIdentifierWhenEmpty && !normalizedGtin && !normalizedMpn;

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
