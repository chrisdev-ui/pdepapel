// Sin dependencias de servidor: lo usan el asistente, Configuración y la cola.
import { VARIANT_ATTRIBUTE_IDS } from "./group-publication";
import type { MercadoLibreAttribute } from "./listing-metadata";

/**
 * Perfiles rápidos aprendidos (#22): cada subcategoría del panel recuerda las
 * categorías de Mercado Libre con que se publicó, ordenadas por uso. Un
 * perfil aprendido empieza «sugerido»: se propone, pero se aplica solo
 * después de que Paula lo acepta una vez con «Usar esta».
 */

export type ProfileOrigin = "MANUAL" | "LEARNED";
export type ProfileState = "SUGGESTED" | "ACCEPTED";

export type CategoryCandidate = {
  categoryId: string;
  categoryName: string | null;
  uses: number;
  lastUsedAt: string;
};

export const MAX_CATEGORY_CANDIDATES = 5;

export function parseCategoryCandidates(value: unknown): CategoryCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.categoryId !== "string" || !record.categoryId) return [];
    return [
      {
        categoryId: record.categoryId,
        categoryName: typeof record.categoryName === "string" ? record.categoryName : null,
        uses: typeof record.uses === "number" && record.uses > 0 ? record.uses : 1,
        lastUsedAt: typeof record.lastUsedAt === "string" ? record.lastUsedAt : new Date(0).toISOString(),
      },
    ];
  });
}

export function addCategoryUse(
  candidates: readonly CategoryCandidate[],
  use: { categoryId: string; categoryName: string | null; at: string },
): CategoryCandidate[] {
  const existing = candidates.find((candidate) => candidate.categoryId === use.categoryId);
  const updated = existing
    ? candidates.map((candidate) =>
        candidate.categoryId === use.categoryId
          ? { ...candidate, uses: candidate.uses + 1, lastUsedAt: use.at, categoryName: use.categoryName ?? candidate.categoryName }
          : candidate,
      )
    : [...candidates, { categoryId: use.categoryId, categoryName: use.categoryName, uses: 1, lastUsedAt: use.at }];
  return updated
    .sort((a, b) => b.uses - a.uses || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MAX_CATEGORY_CANDIDATES);
}

export function shouldAutoApplyProfile(profile: { state?: string | null }) {
  return profile.state !== "SUGGESTED";
}

const PACKAGE_ATTRIBUTE = /^PACKAGE_/;
/** Lo que es de un producto y no de la subcategoría: no se aprende. */
const PRODUCT_SPECIFIC = new Set([...Array.from(VARIANT_ATTRIBUTE_IDS), "MODEL", "UNITS_PER_PACK"]);

export function learnedProfileAttributes(attributes: readonly MercadoLibreAttribute[]): MercadoLibreAttribute[] {
  return attributes.filter((attribute) => {
    const id = attribute.id.toUpperCase();
    return !PRODUCT_SPECIFIC.has(id) && !PACKAGE_ATTRIBUTE.test(id);
  });
}

export type BackfillListing = {
  localCategoryId: string;
  localCategoryName: string;
  categoryId: string;
  attributes: MercadoLibreAttribute[];
};

export type BackfillGroup = {
  localCategoryId: string;
  localCategoryName: string;
  /** Null si la subcategoría está mezclada. */
  categoryId: string | null;
  categoryIds: string[];
  listings: number;
  attributes: MercadoLibreAttribute[];
  skipped: "mezclada" | "ya tiene perfil" | null;
};

/**
 * Siembra desde lo ya publicado: una subcategoría cuyas publicaciones usan
 * una sola categoría de Mercado Libre se propone como perfil sugerido. Si
 * usan varias (una subcategoría amplia, como la que junta grapadora e
 * impresora), queda fuera: adivinar sería peor que no sugerir.
 */
export function groupListingsForBackfill(
  listings: readonly BackfillListing[],
  existingProfiles: ReadonlySet<string>,
): BackfillGroup[] {
  const groups = new Map<string, BackfillListing[]>();
  for (const listing of listings) {
    groups.set(listing.localCategoryId, [...(groups.get(listing.localCategoryId) ?? []), listing]);
  }
  return Array.from(groups.values())
    .map((items): BackfillGroup => {
      const categoryIds = Array.from(new Set(items.map((item) => item.categoryId)));
      const mixed = categoryIds.length > 1;
      return {
        localCategoryId: items[0].localCategoryId,
        localCategoryName: items[0].localCategoryName,
        categoryId: mixed ? null : categoryIds[0],
        categoryIds,
        listings: items.length,
        attributes: mixed ? [] : learnedProfileAttributes(items[0].attributes),
        skipped: existingProfiles.has(items[0].localCategoryId) ? "ya tiene perfil" : mixed ? "mezclada" : null,
      };
    })
    .sort((a, b) => a.localCategoryName.localeCompare(b.localCategoryName, "es"));
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Modelo sugerido con datos del propio catálogo: el nombre del grupo o el del
 * producto sin su color, talla o diseño. Es una sugerencia que Paula
 * confirma; nunca pisa lo escrito.
 */
export function suggestModelName(product: {
  name: string;
  productGroupName?: string | null;
  colorName?: string | null;
  sizeName?: string | null;
  designName?: string | null;
}): string | null {
  const group = product.productGroupName?.trim();
  if (group) return group;
  let name = product.name;
  for (const word of [product.colorName, product.sizeName, product.designName]) {
    if (word?.trim()) name = name.replace(new RegExp(`\\s*\\b${escapeRegExp(word.trim())}\\b`, "i"), "");
  }
  const cleaned = name.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

/** Dominios de otro rubro: ferretería, bebé, belleza, mascotas, comida, autos. */
const OTHER_TRADE_DOMAIN =
  /DIE_NUT|TAP_AND_DIE|DRILL|SCREW|WRENCH|TOOL_|HARDWARE|TOY_STORAGE|BABY|SKIN|BEAUTY|MAKEUP|COSMETIC|HAIR|NAIL|PERFUME|FRAGRANCE|BATH|SHAVING|HEALTH|SUPPLEMENT|PET_|FOOD|AUTO/i;

export function isOtherTradeDomain(domainId: string | null | undefined) {
  return Boolean(domainId && OTHER_TRADE_DOMAIN.test(domainId));
}

/** Las de otro rubro bajan al final con su etiqueta; no se esconden. */
export function rankCategorySuggestions<T extends { domainId: string | null }>(suggestions: readonly T[]) {
  const marked = suggestions.map((suggestion) => ({ ...suggestion, otherTrade: isOtherTradeDomain(suggestion.domainId) }));
  return [...marked.filter((suggestion) => !suggestion.otherTrade), ...marked.filter((suggestion) => suggestion.otherTrade)];
}
