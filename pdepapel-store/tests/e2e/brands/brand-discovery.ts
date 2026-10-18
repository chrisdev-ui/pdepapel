/**
 * Datos de `brands.spec.ts` sacados de la API pública de la tienda, para que el
 * chequeo semanal no dependa de slugs escritos a mano. Una variable E2E_* ya
 * definida siempre gana. La marca oculta no se puede descubrir (la API pública
 * nunca la muestra): ese bloque solo corre con sus E2E_HIDDEN_*.
 */
export const PRODUCTION_STORE_URL = "https://papeleriapdepapel.com";
export const PRODUCTION_ADMIN_API = "https://admin.papeleriapdepapel.com/api/f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

export type PublicBrandRow = { name: string; slug: string; productCount: number; parent: { name: string; slug: string } | null };
export type PublicProductRow = { slug: string; stock: number; isGroup?: boolean; brand: { slug: string } | null };

const MIN_IN_STOCK = 3;
/** La prueba de la madre busca un producto de la línea en la primera página del catálogo filtrado. */
const FIRST_PAGE = 24;

/** La API del panel de la tienda que se prueba, o null si no se sabe cuál es (no se mezcla una tienda local con la API de producción). */
export function discoveryApi(env: Partial<Record<string, string>>): string | null {
  if (env.E2E_ADMIN_API_URL) return env.E2E_ADMIN_API_URL;
  const base = (env.E2E_BASE_URL || PRODUCTION_STORE_URL).replace(/\/$/, "");
  return base === PRODUCTION_STORE_URL ? PRODUCTION_ADMIN_API : null;
}

/** Productos propios con existencias (no los de sus líneas ni las tarjetas de grupo), el de más existencias primero. */
export function inStockOwnProducts(slug: string, products: PublicProductRow[]) {
  return products.filter((product) => product.brand?.slug === slug && !product.isGroup && product.stock > 0).sort((a, b) => b.stock - a.stock);
}

export function pickEmptyBrand(brands: PublicBrandRow[]) {
  return brands.find((brand) => brand.productCount === 0) ?? null;
}

export function pickLine(brands: PublicBrandRow[]) {
  const lines = brands.filter((brand) => brand.parent && brand.productCount > 0);
  const parentCount = (line: PublicBrandRow) => brands.find((brand) => brand.slug === line.parent!.slug)?.productCount ?? Infinity;
  return lines.find((line) => parentCount(line) <= FIRST_PAGE) ?? lines[0] ?? null;
}

/** Marcas principales con al menos tres productos, en el orden del panel. */
export function brandCandidates(brands: PublicBrandRow[]) {
  return brands.filter((brand) => !brand.parent && brand.productCount >= MIN_IN_STOCK);
}

export function hasEnoughStock(products: PublicProductRow[]) {
  return products.length >= MIN_IN_STOCK;
}
