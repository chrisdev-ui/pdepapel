/**
 * Canónica e indexación de los listados (`/tienda`, `/categoria/[slug]`).
 *
 * - Sin parámetros: canónica a la URL base; se indexa si la plantilla lo
 *   permite (`/tienda` siempre, una categoría solo con `seoEnabled`).
 * - Solo `page=N` con N ≥ 2: canónica a sí misma (`?page=N`), como pide
 *   Google para la paginación: la página 2 no es un duplicado de la 1. Sigue
 *   `noindex, follow`, igual que antes; si conviene indexarla es una decisión
 *   aparte (propuestas de la ola 3, fase 2). El sitemap solo lista la base.
 * - `page=1`, un `page` no válido o cualquier otro parámetro (filtros, orden,
 *   búsqueda): canónica a la base y `noindex`, sin cambios.
 */
import { parseBrandParam } from "@/lib/brand-display";
import { brandPath } from "@/lib/routes";

export type ListingSearchParams = Record<string, string | string[] | undefined>;

export type ListingIndexing = {
  canonical: string;
  index: boolean;
};

const hasValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.some((item) => item !== "") : value !== undefined && value !== "";

/** El número de página si es la única señal de la URL y vale 2 o más. */
export function getPaginationOnlyPage(searchParams: ListingSearchParams): number | null {
  const keys = Object.keys(searchParams).filter((key) => hasValue(searchParams[key]));
  if (keys.length !== 1 || keys[0] !== "page") return null;
  const raw = searchParams.page;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 2 ? page : null;
}

export function getListingIndexing(
  basePath: string,
  searchParams: ListingSearchParams,
  baseIndexable: boolean,
): ListingIndexing {
  const hasParams = Object.values(searchParams).some(hasValue);
  if (!hasParams) return { canonical: basePath, index: baseIndexable };
  const page = getPaginationOnlyPage(searchParams);
  return { canonical: page ? `${basePath}?page=${page}` : basePath, index: false };
}

/**
 * `?page=` más allá de la última página: a dónde redirigir (la última, con los
 * mismos filtros, o la base si solo hay una). `null` si no hace falta.
 */
export function outOfRangePageTarget(
  basePath: string,
  searchParams: ListingSearchParams,
  totalPages: number,
): string | null {
  const raw = searchParams.page;
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || totalPages < 1) return null;
  if (Number(raw) <= totalPages) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page" || value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) params.append(key, item);
  }
  if (totalPages > 1) params.set("page", String(totalPages));
  const entries = Array.from(params.entries()).sort(([a], [b]) => (a === "page" ? -1 : b === "page" ? 1 : 0));
  const query = new URLSearchParams(entries).toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * `/tienda?marca=<una sola>` sin ningún otro parámetro muestra lo mismo que
 * `/marcas/<slug>`: esa es la canónica (y la de la tienda queda `noindex`).
 * Varias marcas o más filtros siguen las reglas de arriba.
 */
export function singleBrandCanonical(searchParams: ListingSearchParams): string | null {
  const keys = Object.keys(searchParams).filter((key) => hasValue(searchParams[key]));
  if (keys.length !== 1 || keys[0] !== "marca") return null;
  const slugs = parseBrandParam(searchParams.marca);
  return slugs.length === 1 ? brandPath(slugs[0]) : null;
}

/** Canónica e indexación de `/tienda`, con el caso de una sola marca. */
export function getShopIndexing(basePath: string, searchParams: ListingSearchParams): ListingIndexing {
  const brandCanonical = singleBrandCanonical(searchParams);
  if (brandCanonical) return { canonical: brandCanonical, index: false };
  return getListingIndexing(basePath, searchParams, true);
}
