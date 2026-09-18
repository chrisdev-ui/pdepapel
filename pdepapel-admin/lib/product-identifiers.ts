const GTIN_PATTERN = /^(\d{8}|\d{12,14})$/;
const MAX_MPN_LENGTH = 70;

export const GTIN_FORMAT_MESSAGE = "El GTIN debe tener 8, 12, 13 o 14 dígitos";
export const GTIN_CHECKSUM_MESSAGE =
  "Ese GTIN no es válido: revisa los dígitos, el último es de control";

/** Solo forma: 8, 12, 13 o 14 dígitos. */
export function hasGtinShape(value: string): boolean {
  return GTIN_PATTERN.test(value);
}

/**
 * GTIN real según GS1: forma correcta y dígito de control válido. Un código
 * tecleado o escaneado con un dígito cambiado se rechaza igual que lo hace
 * el análisis de fotos; antes solo se miraba la longitud.
 */
export function isValidGtin(value: string): boolean {
  if (!hasGtinShape(value)) return false;
  const digits = value.split("").map(Number);
  const checkDigit = digits[digits.length - 1];
  const sum = digits
    .slice(0, -1)
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit;
}

/** Mensaje para un GTIN escrito a mano, o null si es válido o está vacío. */
export function gtinValidationMessage(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (!hasGtinShape(normalized)) return GTIN_FORMAT_MESSAGE;
  if (!isValidGtin(normalized)) return GTIN_CHECKSUM_MESSAGE;
  return null;
}

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

  const gtinError = gtinValidationMessage(normalizedGtin);
  if (gtinError) throw new Error(gtinError);
  if (normalizedMpn.length > MAX_MPN_LENGTH) {
    throw new Error("La referencia del fabricante no puede superar 70 caracteres");
  }

  return {
    gtin: hasNoIdentifier ? null : normalizedGtin || null,
    mpn: hasNoIdentifier ? null : normalizedMpn || null,
    hasNoProductIdentifier: hasNoIdentifier,
  };
}

type GtinLookup = {
  product: {
    findFirst: (args: {
      where: { storeId: string; gtin: string; NOT?: { id: string } };
      select: { id: true; name: true };
    }) => Promise<{ id: string; name: string } | null>;
  };
};

/** Otro producto de la tienda con el mismo GTIN, si existe. */
export async function findProductWithGtin(
  db: GtinLookup,
  { storeId, gtin, excludeProductId }: { storeId: string; gtin: string | null; excludeProductId?: string },
) {
  if (!gtin) return null;
  return db.product.findFirst({
    where: { storeId, gtin, ...(excludeProductId ? { NOT: { id: excludeProductId } } : {}) },
    select: { id: true, name: true },
  });
}
