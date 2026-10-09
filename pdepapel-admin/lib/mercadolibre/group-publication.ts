// Sin dependencias de servidor: lo usan la ruta y el diálogo «Publicar grupo».
import { getUnitCostFloor } from "@/lib/product-costs";

import type { MercadoLibreAttribute } from "./listing-metadata";
import {
  getMercadoLibreMarginBreakdown,
  getMercadoLibreMarginWarning,
  suggestMercadoLibrePrice,
  type MercadoLibreMarginBreakdown,
} from "./listing-margin";
import {
  prefillListingAttributes,
  type ListingWizardCategoryAttribute,
  type ListingWizardPrefillProduct,
} from "./listing-wizard";

/** Lo que cambia de una variante a otra: no se copia del borrador base. */
export const VARIANT_ATTRIBUTE_IDS: ReadonlySet<string> = new Set([
  "COLOR",
  "MAIN_COLOR",
  "SIZE",
  "DESIGN",
  "GTIN",
  "MPN",
  "SELLER_SKU",
  "EMPTY_GTIN_REASON",
]);

export const MAX_GROUP_PUBLICATION_VARIANTS = 20;

/**
 * Ficha técnica de una variante: lo común del borrador base (marca, material,
 * medidas…) y lo propio de la variante (color, diseño, código de barras)
 * rellenado desde el producto, nunca copiado de otra variante.
 */
export function buildVariantAttributes(
  master: readonly MercadoLibreAttribute[],
  categoryAttributes: readonly ListingWizardCategoryAttribute[],
  variant: ListingWizardPrefillProduct,
): MercadoLibreAttribute[] {
  const shared = master.filter((attribute) => !VARIANT_ATTRIBUTE_IDS.has(attribute.id.toUpperCase()));
  const sharedIds = new Set(shared.map((attribute) => attribute.id.toUpperCase()));
  const sharedText = shared
    .map((attribute) => `${attribute.id}=${attribute.value_name ?? attribute.value_id ?? ""}`)
    .join("\n");
  const additions = prefillListingAttributes(sharedText, categoryAttributes, variant)
    .split("\n")
    .flatMap((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) return [];
      const id = line.slice(0, separator).trim().toUpperCase();
      const value = line.slice(separator + 1).trim();
      return id && value && !sharedIds.has(id) ? [{ id, value_name: value }] : [];
    });
  return [...shared, ...additions];
}

export type GroupVariantRemoteItem = {
  id: string;
  status: string | null;
  userProductId: string | null;
};

export type GroupVariantInput = {
  isArchived: boolean;
  stock: number;
  imageCount: number;
  listing: { externalItemId: string | null; externalUserProductId?: string | null } | null;
  /** Ítems de Mercado Libre con el SKU de la variante; null si no se pudo consultar. */
  remoteItems: readonly GroupVariantRemoteItem[] | null;
};

export type GroupVariantState =
  | { kind: "ready"; available: number }
  | { kind: "listed"; itemId: string; twins: string[] }
  | { kind: "draft" }
  | { kind: "remote"; itemIds: string[] }
  | { kind: "unchecked" }
  | { kind: "archived" }
  | { kind: "no-stock" }
  | { kind: "no-photos" };

/**
 * Qué se puede hacer con cada variante. Una variante que ya tiene ítem en
 * Mercado Libre (vinculado o no) nunca se vuelve a crear: el nuevo quedaría
 * duplicado y compartiría el stock del mismo producto de usuario.
 */
export function getGroupVariantState(variant: GroupVariantInput, stockSafetyBuffer: number): GroupVariantState {
  if (variant.listing?.externalItemId) {
    const itemId = variant.listing.externalItemId;
    const userProductId =
      variant.listing.externalUserProductId ??
      variant.remoteItems?.find((item) => item.id === itemId)?.userProductId ??
      null;
    const twins = userProductId && variant.remoteItems
      ? variant.remoteItems.filter((item) => item.id !== itemId && item.userProductId === userProductId).map((item) => item.id)
      : [];
    return { kind: "listed", itemId, twins };
  }
  if (variant.listing) return { kind: "draft" };
  if (variant.remoteItems === null) return { kind: "unchecked" };
  if (variant.remoteItems.length) return { kind: "remote", itemIds: variant.remoteItems.map((item) => item.id) };
  if (variant.isArchived) return { kind: "archived" };
  const available = Math.max(0, variant.stock - stockSafetyBuffer);
  if (available === 0) return { kind: "no-stock" };
  if (variant.imageCount === 0) return { kind: "no-photos" };
  return { kind: "ready", available };
}

export function describeGroupVariantState(state: GroupVariantState): string {
  switch (state.kind) {
    case "ready":
      return `Lista: ${state.available} ${state.available === 1 ? "unidad" : "unidades"} para Mercado Libre.`;
    case "listed":
      return state.twins.length
        ? `Ya publicada: ${state.itemId}. Comparte stock y SKU con ${state.twins.join(", ")} (mismo producto de usuario).`
        : `Ya publicada: ${state.itemId}.`;
    case "draft":
      return "Ya tiene un borrador: publícalo desde su fila.";
    case "remote":
      return `Ya existe en Mercado Libre sin vincular (${state.itemIds.join(", ")}). Vincúlala en «Importar existentes»; no se crea otra.`;
    case "unchecked":
      return "No se pudo revisar si ya existe en Mercado Libre. Vuelve a abrir esta ventana en un momento.";
    case "archived":
      return "Producto archivado.";
    case "no-stock":
      return "Sin unidades después del stock de seguridad.";
    case "no-photos":
      return "Sin fotos.";
  }
}

export type GroupVariantEconomics = {
  breakdown: MercadoLibreMarginBreakdown;
  /** Pérdida o ganancia por debajo del objetivo de la tienda; null si cumple. */
  warning: string | null;
  /** Menor precio que cumple el objetivo con la misma comisión y envío. */
  suggestedPrice: number | null;
};

/** Neto por unidad de una variante con la comisión y el envío cotizados para el grupo. */
export function getGroupVariantEconomics({
  price,
  product,
  feeRate,
  shippingCost,
  pricingTargets,
}: {
  price: number;
  product: { acqPrice?: number | null; transportationCost?: number | null };
  feeRate: number;
  shippingCost: number;
  pricingTargets: { targetMarginPercent: number; minNetPerUnit: number } | null;
}): GroupVariantEconomics {
  const unitCost = getUnitCostFloor(product);
  const breakdown = getMercadoLibreMarginBreakdown({ price, feeAmount: price * feeRate, shippingCost, unitCost });
  const targetMarginRate = pricingTargets ? pricingTargets.targetMarginPercent / 100 : null;
  const minNetPerUnit = pricingTargets?.minNetPerUnit ?? null;
  const breakevenPrice =
    unitCost === null ? null : suggestMercadoLibrePrice({ unitCost, shippingCost, feeRate, targetNet: 0 });
  return {
    breakdown,
    warning: getMercadoLibreMarginWarning(breakdown, { breakevenPrice, targetMarginRate, minNetPerUnit }),
    suggestedPrice:
      unitCost === null || !pricingTargets
        ? null
        : suggestMercadoLibrePrice({
            unitCost,
            shippingCost,
            feeRate,
            targetNet: pricingTargets.minNetPerUnit,
            targetMarginRate: pricingTargets.targetMarginPercent / 100,
          }),
  };
}
