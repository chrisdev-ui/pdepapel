import { isValidGtin } from "@/lib/product-identifiers";

/**
 * Marcas con códigos de barras registrados en Mercado Libre: para ellas el
 * motivo «sin código» (EMPTY_GTIN_REASON) no vale y la publicación se rechaza
 * con `item.attribute.missing_conditional_required` sobre GTIN. La categoría
 * no lo dice; se aprende del rechazo. Cada marca nueva que llegue así se
 * agrega aquí. Primavera, Offi-Esco y Kores: tanda ola-1, 2026-10-31.
 */
export const MERCADOLIBRE_GTIN_REQUIRED_BRANDS = ["Primavera", "Offi-Esco", "Kores"] as const;

const brandKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const REQUIRED_KEYS = new Set(MERCADOLIBRE_GTIN_REQUIRED_BRANDS.map(brandKey));

export function isMercadoLibreGtinRequiredBrand(brand: string | null | undefined) {
  return Boolean(brand && REQUIRED_KEYS.has(brandKey(brand)));
}

/** Problema de la ficha para una marca que exige GTIN, o null si la ficha trae uno válido o la marca no lo exige. */
export function mercadoLibreGtinRequiredBrandProblem(brand: string | null | undefined, gtin: string | null | undefined) {
  if (!isMercadoLibreGtinRequiredBrand(brand)) return null;
  const value = (gtin ?? "").trim();
  if (!value) return { kind: "missing" as const, message: `GTIN (${brand} tiene códigos registrados en Mercado Libre: hace falta el código de barras real del empaque; «sin código» no aplica)` };
  if (!isValidGtin(value)) return { kind: "invalid" as const, message: `GTIN (${value} no es un código válido: revisa los dígitos, el último es de control)` };
  return null;
}
