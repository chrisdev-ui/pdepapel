import { brandDataName } from "@/lib/brand-rules";

/**
 * Mientras no esté verificada la migración de datos de marcas (texto libre →
 * `Brand`), Mercado Libre usa el texto anterior cuando el producto todavía no
 * tiene marca enlazada. Pasarlo a `false` cuando el plan de marcas ya no
 * encuentre productos por asignar.
 */
export const MERCADOLIBRE_LEGACY_BRAND_FALLBACK = true;

const BRAND_NAME = { select: { name: true, isArchived: true } } as const;

/** Lo que hay que leer de un producto para saber su marca en Mercado Libre. */
export const MERCADOLIBRE_BRAND_SELECT = {
  brand: true,
  brandRef: BRAND_NAME,
  productGroup: { select: { brand: true, brandRef: BRAND_NAME } },
} as const;

type BrandRow = { name: string; isArchived: boolean } | null | undefined;

export interface MercadoLibreBrandSource {
  brand?: string | null;
  brandRef?: BrandRow;
  productGroup?: { brand?: string | null; brandRef?: BrandRow } | null;
}

/** Marca que se manda como BRAND: la enlazada (aunque esté oculta, nunca archivada) y, por ahora, el texto anterior. */
export function mercadoLibreBrandName(product: MercadoLibreBrandSource | null | undefined): string | null {
  if (!product) return null;
  const linked = brandDataName(product.brandRef ?? product.productGroup?.brandRef ?? null);
  if (linked) return linked;
  if (product.brandRef || product.productGroup?.brandRef) return null;
  if (!MERCADOLIBRE_LEGACY_BRAND_FALLBACK) return null;
  const legacy = (product.brand || product.productGroup?.brand || "").trim();
  return legacy || null;
}
