/**
 * Publicador por tandas (B2). Arma, para cada producto de una tanda aprobada,
 * el mismo borrador que publicaría el panel (`ListingForPublication`) y dice
 * si puede salir. El ensayo imprime el cuerpo exacto con
 * `buildMercadoLibreItemPayload`; la publicación real solo crea borradores y
 * encola PUBLISH_LISTING, y el trabajador vuelve a revisar el interruptor y
 * la preventa antes de llamar a Mercado Libre.
 */
import type { Prisma } from "@prisma/client";

import { type MercadoLibreBrandSource, mercadoLibreBrandName } from "@/lib/mercadolibre/brand";
import { inspectMercadoLibreDescription } from "@/lib/mercadolibre/description-rules";
import type { MercadoLibreAttribute, MercadoLibrePackageDimensions } from "@/lib/mercadolibre/listing-metadata";
import type { ListingForPublication } from "@/lib/mercadolibre/listings";
import type { LicensedMatch } from "@/lib/mercadolibre/licensed-characters";
import { type WaveCategoryStatus, type WaveFeeSource, waveItemReadiness } from "@/lib/mercadolibre/wave-readiness";
import { type ProductPackage, productPackageOf } from "@/lib/product-package";
import { richTextToPlainText } from "@/lib/rich-text";

/** Colchón de stock de las tandas (decisión 2026-10-30): se publica lo vendible menos 1. */
export const WAVE_STOCK_SAFETY_BUFFER = 1;
/** Premium desde 40.000; Clásica por debajo (decisión 2026-10-30). */
export const WAVE_PREMIUM_FROM = 40_000;
export const MERCADOLIBRE_TITLE_MAX = 60;
export const GENERIC_BRAND = "Genérica";

export const waveListingType = (price: number) => (price >= WAVE_PREMIUM_FROM ? "gold_pro" : "gold_special");

export interface WavePlanPicture {
  position: number;
  kind: string;
  url: string;
  ok: boolean;
}

export interface WavePlanItem {
  rank: number;
  sku: string;
  categoryId: string;
  approvedMlPrice: number;
  /** Lo que dejó la validación de la tanda; sin dato, el producto no sale. */
  categoryStatus?: WaveCategoryStatus | null;
  categoryMatchesPredictorTop?: boolean;
  feeSource?: WaveFeeSource | null;
  /** Título para Mercado Libre (≤ 60), aprobado en la tanda; sin él, el nombre del producto. */
  title?: string | null;
  /** Marca para BRAND aprobada en la tanda, cuando el producto no la tiene enlazada. */
  brandName?: string | null;
  package?: (ProductPackage & { profile?: string }) | null;
  imagePack?: { recipe: string; approved: boolean; flags?: string[]; pictures: WavePlanPicture[] } | null;
}

export interface WavePlan {
  waveId: string;
  items: WavePlanItem[];
}

export interface WaveProduct extends MercadoLibreBrandSource {
  id: string;
  sku: string;
  name: string;
  description: string;
  stock: number;
  reservedUnits: number;
  isArchived: boolean;
  gtin: string | null;
  mpn: string | null;
  hasNoProductIdentifier: boolean;
  acqPrice: number | null;
  transportationCost: number | null;
  images: { url: string }[];
  packageWeightGrams?: number | null;
  packageHeightCm?: number | null;
  packageWidthCm?: number | null;
  packageLengthCm?: number | null;
}

export interface WaveProductFacts {
  /** Lo vendible hoy (stock − apartados), ya en 0 si hay preventa. */
  sellable: number;
  presaleBlocked: boolean;
  licensed: LicensedMatch | null;
  licenseApproved: boolean;
  /** Ya existe una publicación (borrador o viva) de este producto en la conexión. */
  alreadyListed: boolean;
}

export interface WaveItemPlan {
  rank: number;
  sku: string;
  publishable: boolean;
  reasons: string[];
  warnings: string[];
  packageSource: "medido" | "perfil de la tanda" | null;
  draft: ListingForPublication | null;
  metadata: Prisma.InputJsonValue | null;
}

const toDimensions = (value: ProductPackage): MercadoLibrePackageDimensions => ({
  heightCm: value.heightCm,
  widthCm: value.widthCm,
  lengthCm: value.lengthCm,
  weightGrams: value.weightGrams,
});

export function planWaveItem(
  item: WavePlanItem,
  product: WaveProduct | null,
  facts: WaveProductFacts | null,
  connectionId: string,
): WaveItemPlan {
  const base = { rank: item.rank, sku: item.sku };
  if (!product || !facts) {
    return { ...base, publishable: false, reasons: ["El SKU no existe en la tienda."], warnings: [], packageSource: null, draft: null, metadata: null };
  }

  const reasons: string[] = [];
  const warnings: string[] = [];
  if (product.isArchived) reasons.push("El producto está archivado.");
  if (facts.alreadyListed) reasons.push("Ya tiene una publicación en Mercado Libre (borrador o viva).");

  // La hoja de contacto es la aprobación de la tanda: sin ella nada sale.
  const pack = item.imagePack ?? null;
  const readiness = waveItemReadiness({
    categoryStatus: item.categoryStatus ?? null,
    categoryMatchesPredictorTop: item.categoryMatchesPredictorTop ?? false,
    feeSource: item.feeSource ?? "pendiente",
    photoStatus: pack && pack.pictures.length > 0 && pack.pictures.every((picture) => picture.ok) ? "apta" : "revisar",
    contactSheetApproved: Boolean(pack?.approved),
    presaleBlocked: facts.presaleBlocked,
    licensed: facts.licensed,
    licenseApproved: facts.licenseApproved,
  });
  reasons.push(...readiness.reasons);

  if (facts.sellable <= 1) reasons.push(`Solo ${facts.sellable} unidad(es) vendible(s): las tandas excluyen productos de una sola unidad.`);
  const availableQuantity = Math.max(0, facts.sellable - WAVE_STOCK_SAFETY_BUFFER);

  const measured = productPackageOf(product);
  const packageValue = measured ?? item.package ?? null;
  const packageSource = measured ? "medido" : item.package ? "perfil de la tanda" : null;
  if (!packageValue) reasons.push("Faltan peso y medidas del paquete.");
  else if (!measured) warnings.push(`Paquete del perfil «${item.package?.profile ?? "de la tanda"}», no medido producto por producto.`);

  if (!item.approvedMlPrice || item.approvedMlPrice <= 0) reasons.push("Falta el precio de Mercado Libre aprobado.");

  const planTitle = item.title?.trim() || null;
  const familyName = planTitle ?? product.name.trim();
  if (familyName.length > MERCADOLIBRE_TITLE_MAX) {
    const message = `El título tiene ${familyName.length} caracteres; el máximo es ${MERCADOLIBRE_TITLE_MAX}.`;
    if (planTitle) reasons.push(message);
    else warnings.push(message);
  }

  const description = inspectMercadoLibreDescription(richTextToPlainText(product.description ?? ""));
  if (!description.clean.trim()) warnings.push("Sin descripción: se publica solo con la ficha.");
  else if (description.issues.length) warnings.push("La descripción se envía limpia (sin enlaces, contacto, HTML ni emojis).");

  const attributes: MercadoLibreAttribute[] = [];
  const planBrand = item.brandName?.trim() || null;
  if (planBrand) {
    attributes.push({ id: "BRAND", value_name: planBrand });
    if (!mercadoLibreBrandName(product)) warnings.push(`Marca «${planBrand}» de la tanda (el producto no la tiene enlazada).`);
  } else if (!mercadoLibreBrandName(product)) {
    attributes.push({ id: "BRAND", value_name: GENERIC_BRAND });
    warnings.push("Sin marca enlazada: se publica como «Genérica».");
  }
  if (!product.gtin) {
    warnings.push(product.hasNoProductIdentifier ? "Sin código de barras (marcado así en Productos)." : "Sin GTIN: Mercado Libre puede pedirlo en esta categoría.");
  }

  const packPictures = pack?.pictures.slice().sort((a, b) => a.position - b.position).map((picture) => picture.url) ?? [];
  const metadata = {
    attributes,
    familyName,
    media: { imageUrls: [], packPictures, packRecipe: pack?.recipe ?? null },
    saleConditions: {
      shippingMode: "me2",
      freeShipping: true,
      localPickUp: false,
      packageDimensions: packageValue ? toDimensions(packageValue) : null,
    },
    source: { kind: "wave", waveRank: item.rank },
    version: 1,
  } satisfies Record<string, unknown>;

  const draft: ListingForPublication = {
    id: `ensayo-${item.sku}`,
    connectionId,
    categoryId: item.categoryId,
    listingType: waveListingType(item.approvedMlPrice),
    marketplacePrice: item.approvedMlPrice,
    stockSafetyBuffer: WAVE_STOCK_SAFETY_BUFFER,
    metadata: metadata as unknown as Prisma.JsonValue,
    product: {
      id: product.id,
      name: product.name,
      description: product.description,
      // El borrador lleva lo vendible ya calculado (con preventas en 0) para que el payload use la misma cifra.
      stock: availableQuantity + WAVE_STOCK_SAFETY_BUFFER,
      reservedUnits: 0,
      sku: product.sku,
      brand: product.brand ?? null,
      brandRef: product.brandRef,
      productGroup: product.productGroup,
      gtin: product.gtin,
      mpn: product.mpn,
      isArchived: product.isArchived,
      images: product.images,
      acqPrice: product.acqPrice,
      transportationCost: product.transportationCost,
      hasNoProductIdentifier: product.hasNoProductIdentifier,
    },
  };

  return {
    ...base,
    publishable: reasons.length === 0,
    reasons,
    warnings,
    packageSource,
    draft,
    metadata: metadata as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Candado de la publicación real: interruptor apagado, bandera igual a la
 * tanda del plan, todo publicable y la hoja de contacto aprobada. Devuelve
 * por qué no; vacío = puede salir.
 */
export function wavePublishBlockers(input: {
  writesPaused: boolean;
  approveWaveFlag: string | null;
  plan: WavePlan;
  items: readonly WaveItemPlan[];
}): string[] {
  const blockers: string[] = [];
  if (input.writesPaused) blockers.push("Las escrituras a Mercado Libre están en pausa: no se publica nada.");
  if (!input.approveWaveFlag) blockers.push(`Falta --approve-wave=${input.plan.waveId}.`);
  else if (input.approveWaveFlag !== input.plan.waveId) blockers.push(`--approve-wave=${input.approveWaveFlag} no es la tanda del plan (${input.plan.waveId}).`);
  for (const item of input.items) {
    if (!item.publishable) blockers.push(`#${item.rank} ${item.sku}: ${item.reasons.join(" ")}`);
  }
  return blockers;
}
