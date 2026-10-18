import { productBrand } from "@/lib/product-brand";
import type { BrandLogoPermission, Product } from "@/types";

/** Menos productos activos que esto: la página de la marca queda `noindex, follow` (contenido demasiado delgado). */
export const BRAND_PAGE_INDEX_MIN_PRODUCTS = 3;

/** Copia de `canShowBrandLogo` del panel: sin permiso confirmado o negado, va el nombre. */
export function canShowBrandLogo(brand: { logoUrl: string | null; logoPermission: BrandLogoPermission } | null | undefined): boolean {
  return Boolean(brand?.logoUrl) && brand?.logoPermission !== "PENDING" && brand?.logoPermission !== "DENIED";
}

/** El logo que se puede pintar, o null (entonces va el nombre en una píldora). */
export function brandLogoUrl(brand: { logoUrl: string | null; logoPermission: BrandLogoPermission } | null | undefined): string | null {
  return canShowBrandLogo(brand) ? (brand?.logoUrl ?? null) : null;
}

export { brandDataName, productBrand, publicProductBrand } from "@/lib/product-brand";

/** Nombre para JSON-LD: la marca madre si es una línea (también si la madre está oculta). */
export function topLevelBrandName(product: Pick<Product, "brand" | "productGroup">): string | undefined {
  const brand = productBrand(product);
  return brand?.parent?.name || brand?.name || undefined;
}

/** Lista de nombres en español: «Kiut», «Kiut y Norma», «Kiut, Norma y Scribe». */
export function joinBrandNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** Los slugs de `?marca=` sin vacíos ni repetidos. */
export function parseBrandParam(value: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return Array.from(new Set(raw.split(",").map((slug) => slug.trim()).filter(Boolean)));
}

export type BrandPageState = { kind: "empty" } | { kind: "products"; index: boolean };

/** Sin productos: estado vacío con `noindex`. Con pocos: se ven pero sin indexar. */
export function getBrandPageState(productCount: number, listedItems: number): BrandPageState {
  if (productCount <= 0 || listedItems <= 0) return { kind: "empty" };
  return { kind: "products", index: productCount >= BRAND_PAGE_INDEX_MIN_PRODUCTS };
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * Enlace de un chip de marca: quita la marca si ya está elegida, la suma si
 * no (OR, igual que las casillas). Conserva los demás filtros y vuelve a la
 * primera página.
 */
export function brandToggleHref(basePath: string, searchParams: SearchParamsRecord, slug: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || key === "marca" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) if (item !== "") params.append(key, item);
  }
  const selected = parseBrandParam(searchParams.marca);
  const next = selected.includes(slug) ? selected.filter((item) => item !== slug) : [...selected, slug];
  if (next.length > 0) params.set("marca", next.join(","));
  const query = params.toString().replace(/%2C/g, ",");
  return query ? `${basePath}?${query}` : basePath;
}
