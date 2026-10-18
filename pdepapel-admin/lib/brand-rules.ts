import { slugify } from "@/lib/slugify";

export type BrandLogoPermissionValue = "UNKNOWN" | "ALLOWED" | "PENDING" | "DENIED";

export const BRAND_NAME_MAX_LENGTH = 120;
export const BRAND_SEO_TEXT_MAX_LENGTH = 160;
export const BRAND_ALIAS_MAX_COUNT = 20;
/** Bajo este ancho el logo se ve borroso en el celular. */
export const BRAND_LOGO_MIN_WIDTH = 400;
/** Texto del encabezado de la página de marca (navy de la tienda). */
export const BRAND_HEADER_TEXT_COLOR = "#241B41";
export const BRAND_COLOR_MIN_CONTRAST = 4.5;

export const BRAND_LOGO_PERMISSION_LABELS: Record<BrandLogoPermissionValue, string> = {
  UNKNOWN: "Sin revisar",
  ALLOWED: "Permitido",
  PENDING: "Pendiente",
  DENIED: "Negado",
};

/** Se muestra en la tienda (filtros, menú, página, enlace del producto). */
export function isBrandPublic(brand: { isVisible: boolean; isArchived: boolean }) {
  return brand.isVisible && !brand.isArchived;
}

/** El logo solo sale con archivo y sin permiso pendiente o negado; si no, el nombre en una píldora. */
export function canShowBrandLogo(brand: {
  logoUrl: string | null;
  logoPermission: BrandLogoPermissionValue;
}) {
  return Boolean(brand.logoUrl) && brand.logoPermission !== "PENDING" && brand.logoPermission !== "DENIED";
}

/**
 * Nombre para los datos (JSON-LD, feeds, GA4, Mercado Libre, la línea del
 * pedido): el de la marca enlazada mientras no esté archivada, aunque esté
 * oculta. Oculta solo quiere decir «no se muestra en la tienda».
 */
export function brandDataName(brand: { name: string; isArchived: boolean } | null | undefined) {
  if (!brand || brand.isArchived) return null;
  return brand.name;
}

/**
 * Nombre de primer nivel para JSON-LD, los feeds de Google y Meta y el BRAND
 * de Mercado Libre: el de la marca madre si la marca es una línea («Flower
 * Power» → «Primavera»). GA4 y la línea del pedido usan `brandDataName`, el
 * nombre que se muestra.
 */
export function topLevelBrandName(
  brand: { name: string; isArchived: boolean; parent?: { name: string; isArchived: boolean } | null } | null | undefined,
) {
  const shown = brandDataName(brand);
  if (!shown) return null;
  return brandDataName(brand?.parent ?? null) ?? shown;
}

/** La marca de la que una marca es línea, tal como se lee para validar. */
export interface BrandParentCandidate {
  id: string;
  storeId: string;
  parentBrandId: string | null;
  isArchived: boolean;
}

/**
 * Reglas de «Es una línea de» (un solo nivel). Devuelve el motivo en español
 * o null si se puede. `brandId` es null al crear; `hasLines` dice si la marca
 * que se edita ya tiene líneas sin archivar.
 */
export function brandParentError(input: {
  brandId: string | null;
  storeId: string;
  parent: BrandParentCandidate | null;
  hasLines: boolean;
}): string | null {
  const { brandId, storeId, parent, hasLines } = input;
  if (!parent) return "La marca madre no existe en esta tienda.";
  if (parent.storeId !== storeId) return "La marca madre no existe en esta tienda.";
  if (brandId && parent.id === brandId) return "Una marca no puede ser línea de sí misma.";
  if (parent.isArchived) return "La marca madre está archivada.";
  if (parent.parentBrandId) return "Esa marca ya es una línea: una línea no puede tener líneas.";
  if (hasLines) return "Esta marca tiene líneas: no puede ser a su vez una línea de otra.";
  return null;
}

/**
 * Cada línea justo después de su madre, sin cambiar el orden de lo demás
 * (el `sortOrder` de una línea no tiene por qué estar junto al de su madre).
 * Una línea cuya madre no está en la lista queda donde estaba.
 */
export function placeLinesAfterParents<T extends { id: string; parentBrandId?: string | null }>(rows: T[]): T[] {
  const ids = new Set(rows.map((row) => row.id));
  const linesOf = new Map<string, T[]>();
  for (const row of rows) {
    if (row.parentBrandId && ids.has(row.parentBrandId)) {
      linesOf.set(row.parentBrandId, [...(linesOf.get(row.parentBrandId) ?? []), row]);
    }
  }
  const out: T[] = [];
  for (const row of rows) {
    if (row.parentBrandId && ids.has(row.parentBrandId)) continue;
    out.push(row, ...(linesOf.get(row.id) ?? []));
  }
  return out;
}

export function cleanBrandName(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, BRAND_NAME_MAX_LENGTH);
}

export function brandSlugFromName(name: string) {
  return slugify(name).slice(0, 140);
}

/** Comparación de nombres y alias: sin tildes, mayúsculas ni signos. */
export function brandKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("es-CO")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Alias limpios: sin vacíos, sin repetidos y sin el propio nombre de la marca. */
export function normalizeBrandAliases(input: unknown, brandName = ""): string[] {
  const values = Array.isArray(input) ? input : [];
  const nameKey = brandKey(brandName);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const alias = cleanBrandName(raw);
    const key = brandKey(alias);
    if (!key || key === nameKey || seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
    if (out.length >= BRAND_ALIAS_MAX_COUNT) break;
  }
  return out;
}

/** Los alias guardados en la columna JSON. Un valor que no es lista se trata como «sin alias». */
export function readStoredAliases(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function isBrandColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function relativeLuminance(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** El color tiñe el encabezado de su página: el texto oscuro tiene que leerse encima. */
export function checkBrandColor(color: string) {
  const ratio = contrastRatio(color, BRAND_HEADER_TEXT_COLOR);
  return { ratio, ok: ratio >= BRAND_COLOR_MIN_CONTRAST };
}

export function formatContrastRatio(ratio: number) {
  return `${ratio.toFixed(1).replace(".", ",")} : 1`;
}
