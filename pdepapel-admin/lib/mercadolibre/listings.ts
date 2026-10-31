import { availableStock, marketplaceAvailableStock } from "@/lib/available-stock";
import { MarketplaceListingStatus, Prisma } from "@prisma/client";

import {
  PRESALE_BLOCKS_MARKETPLACE_MESSAGE,
} from "@/lib/presale";
import { toGoogleMerchantImageUrl } from "@/lib/google-merchant";
import { GALLERY_ORDER } from "@/lib/variant-gallery";
import { richTextToPlainText } from "@/lib/rich-text";

import {
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
} from "./categories";
import { isBlockedByPresaleForMercadoLibre } from "./available-quantity";
import { assertMercadoLibreWritesAllowed } from "./writes-switch";
import { DESCRIPTION_ISSUE_LABEL, inspectMercadoLibreDescription } from "./description-rules";
import { inspectRemotePictures } from "./picture-fetch";
import { type MercadoLibreCategoryJsonFetcher, inspectMercadoLibreCategory } from "./category-validation";
import type { MercadoLibreCategoryAttribute } from "./categories";
import { isPriceBelowCost } from "./listing-price-guard";
import { MERCADOLIBRE_MAX_LISTING_PICTURES, shouldUseEmptyGtinReason } from "./listing-wizard";
import {
  mapMercadoLibreItemError,
  readMercadoLibreValidation,
  transientPublicationFailure,
  type MercadoLibreValidationResult,
  type PublicationFailure,
  type PublicationFailureKind,
  type PublicationWizardStep,
} from "./publication-error";
import {
  MERCADOLIBRE_RECONNECT_MESSAGE,
  MercadoLibreReauthError,
  getMercadoLibreAccessToken,
  mercadoLibreFetch,
} from "./client";
import {
  getMercadoLibreAttributes,
  getMercadoLibreListingImageUrls,
  getMercadoLibreListingMetadata,
  type MercadoLibreAttribute,
} from "./listing-metadata";
import { MERCADOLIBRE_BRAND_SELECT, mercadoLibreBrandName, type MercadoLibreBrandSource } from "@/lib/mercadolibre/brand";

export { MERCADOLIBRE_MAX_LISTING_PICTURES } from "./listing-wizard";

/** Lo que se lee de la base para publicar o validar un borrador. */
export const LISTING_FOR_PUBLICATION_SELECT = {
  id: true,
  connectionId: true,
  categoryId: true,
  listingType: true,
  marketplacePrice: true,
  stockSafetyBuffer: true,
  metadata: true,
  product: {
    select: {
      id: true,
      name: true,
      description: true,
      stock: true,
      reservedUnits: true,
      sku: true,
      ...MERCADOLIBRE_BRAND_SELECT,
      gtin: true,
      mpn: true,
      isArchived: true,
      acqPrice: true,
      transportationCost: true,
      hasNoProductIdentifier: true,
      images: {
        select: { url: true, isMain: true },
        orderBy: GALLERY_ORDER,
        take: MERCADOLIBRE_MAX_LISTING_PICTURES,
      },
    },
  },
} satisfies Prisma.MarketplaceListingSelect;

export type ListingForPublication = {
  id: string;
  connectionId: string;
  categoryId: string | null;
  listingType: string | null;
  marketplacePrice: number | null;
  stockSafetyBuffer: number;
  metadata: Prisma.JsonValue | null;
  product: {
    id: string;
    name: string;
    description: string;
    stock: number;
    /** Unidades apartadas para clientas: no se publican. */
    reservedUnits?: number;
    sku: string;
    brand: string | null;
    brandRef?: MercadoLibreBrandSource["brandRef"];
    productGroup?: MercadoLibreBrandSource["productGroup"];
    gtin: string | null;
    mpn: string | null;
    isArchived: boolean;
    images: { url: string }[];
    /** Costo de adquisición; sin él no hay piso de precio que vigilar. */
    acqPrice?: number | null;
    /** Envío y otros gastos por unidad; se suma al piso. */
    transportationCost?: number | null;
    /** Marcado en Productos: no existe código de barras y no se inventa. */
    hasNoProductIdentifier?: boolean;
  };
};

export type MercadoLibreCreatedItem = {
  id: string;
  permalink: string | null;
  status: string | null;
  /** Producto de usuario: los ítems que lo comparten comparten stock y SKU. */
  userProductId: string | null;
  familyId: string | null;
};

/**
 * Estado local a partir del estado con que Mercado Libre devuelve un ítem
 * recién creado. Una sola tabla para la ruta y para la cola: antes una
 * mapeaba lo desconocido a ERROR (con el ítem vivo) y la otra a PAUSED.
 */
export function getMarketplaceListingStatusFromRemote(status: string | null): {
  status: MarketplaceListingStatus;
  note: string | null;
} {
  switch (status) {
    case "active":
      return { status: MarketplaceListingStatus.ACTIVE, note: null };
    case "paused":
      return { status: MarketplaceListingStatus.PAUSED, note: null };
    case "closed":
      return { status: MarketplaceListingStatus.CLOSED, note: null };
    case "under_review":
      return {
        status: MarketplaceListingStatus.PAUSED,
        note: "Mercado Libre está revisando la publicación; se activará cuando termine la revisión.",
      };
    case "payment_required":
      return {
        status: MarketplaceListingStatus.PAUSED,
        note: "Mercado Libre requiere el pago del costo de publicación para activarla. Revísala en Mercado Libre.",
      };
    default:
      return {
        status: MarketplaceListingStatus.PAUSED,
        note: `Mercado Libre devolvió el estado «${status ?? "desconocido"}»; revisa la publicación allí.`,
      };
  }
}

type MercadoLibrePublishedItem = {
  id: string;
  permalink: string | null;
  status: string | null;
  descriptionWarning: string | null;
};

export class MercadoLibrePublicationError extends Error {
  readonly kind: PublicationFailureKind;
  readonly step: PublicationWizardStep | null;
  readonly field: string | null;
  readonly code: string | null;

  constructor(
    message: string,
    {
      requiresDraftReview = false,
      kind,
      step = null,
      field = null,
      code = null,
    }: {
      /** Compatibilidad: equivale a `kind: "review"`. */
      requiresDraftReview?: boolean;
      kind?: PublicationFailureKind;
      step?: PublicationWizardStep | null;
      field?: string | null;
      code?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "MercadoLibrePublicationError";
    this.kind = kind ?? (requiresDraftReview ? "review" : "unknown");
    this.step = step;
    this.field = field;
    this.code = code;
  }

  /** El borrador vuelve a la persona: algo de la ficha está mal. */
  get requiresDraftReview() {
    return this.kind === "review";
  }

  static fromFailure(failure: PublicationFailure) {
    return new MercadoLibrePublicationError(failure.message, failure);
  }

  toFailure(): PublicationFailure {
    return {
      kind: this.kind,
      step: this.step,
      field: this.field,
      code: this.code,
      message: this.message,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getMercadoLibreErrorCauses(payload: unknown) {
  const data = asRecord(payload);
  if (!data || !Array.isArray(data.cause)) return [];

  return data.cause.flatMap((cause) => {
    const item = asRecord(cause);
    if (!item) return [];
    return [
      [item.code, item.message]
        .filter((value): value is string => typeof value === "string")
        .join(" "),
    ].filter(Boolean);
  });
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Mercado Libre rechazó la publicación";
  }
  const data = payload as Record<string, unknown>;
  const message = data.message ?? data.error;
  const causes = getMercadoLibreErrorCauses(payload);
  const mainMessage =
    typeof message === "string"
      ? message
      : "Mercado Libre rechazó la publicación";

  return [mainMessage, ...causes].join(": ").slice(0, 1_000);
}


async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function getConfiguredAttributes(metadata: Prisma.JsonValue | null) {
  return getMercadoLibreAttributes(metadata);
}

function addProductIdentifiers(
  attributes: MercadoLibreAttribute[],
  product: ListingForPublication["product"],
) {
  const configuredIds = new Set(attributes.map((attribute) => attribute.id));
  const result = [...attributes];

  const brand = mercadoLibreBrandName(product);
  if (brand && !configuredIds.has("BRAND")) {
    result.push({ id: "BRAND", value_name: brand });
  }
  if (product.mpn && !configuredIds.has("MPN")) {
    result.push({ id: "MPN", value_name: product.mpn });
  }
  if (product.gtin && !configuredIds.has("GTIN")) {
    result.push({ id: "GTIN", value_name: product.gtin });
  }

  return result;
}

/** La descripción que va a Mercado Libre: la propia de la publicación o, sin ella, la de la tienda. */
export function mercadoLibreListingDescription(listing: { metadata: Prisma.JsonValue | null; product: { description: string } }) {
  return getMercadoLibreListingMetadata(listing.metadata).descriptionOverride ?? listing.product.description;
}

/** El cuerpo exacto de `POST /items`; el publicador por tandas lo usa en el ensayo. */
export function buildMercadoLibreItemPayload(listing: ListingForPublication) {
  return buildItemPayload(listing);
}

function buildItemPayload(listing: ListingForPublication) {
  if (listing.product.isArchived) {
    throw new MercadoLibrePublicationError(
      "No puedes publicar un producto archivado",
      { requiresDraftReview: true },
    );
  }
  if (!listing.categoryId) {
    throw new MercadoLibrePublicationError(
      "Selecciona una categoría de Mercado Libre antes de publicar",
      { requiresDraftReview: true },
    );
  }
  if (!listing.marketplacePrice || listing.marketplacePrice <= 0) {
    throw new MercadoLibrePublicationError(
      "Define un precio de Mercado Libre mayor que cero",
      { requiresDraftReview: true },
    );
  }
  const metadata = getMercadoLibreListingMetadata(listing.metadata);
  if (
    isPriceBelowCost(listing.marketplacePrice, listing.product) &&
    !metadata.belowCostOverride
  ) {
    throw new MercadoLibrePublicationError(
      "El precio de Mercado Libre está por debajo del costo por unidad (adquisición más envío y otros gastos) y nadie autorizó la pérdida. Súbelo o autorízalo con un motivo en «Precio y envío».",
      { kind: "review", step: "precio", field: "marketplacePrice" },
    );
  }
  const familyName = metadata.familyName ?? listing.product.name.trim();
  if (!familyName) {
    throw new MercadoLibrePublicationError(
      "Escribe un nombre de familia antes de publicar",
      { requiresDraftReview: true },
    );
  }
  const packPictures = metadata.media?.packPictures ?? [];
  const pictures = packPictures.length
    ? packPictures
    : getMercadoLibreListingImageUrls(listing.product.images, listing.metadata);
  if (pictures.length === 0) {
    throw new MercadoLibrePublicationError(
      "El producto necesita al menos una imagen para publicarse",
      { requiresDraftReview: true },
    );
  }
  const availableQuantity = marketplaceAvailableStock(listing.product, listing.stockSafetyBuffer);
  if (availableQuantity === 0) {
    throw new MercadoLibrePublicationError(
      "No hay unidades disponibles para publicar después de descontar el stock de seguridad",
      { requiresDraftReview: true },
    );
  }

  const saleConditions = metadata.saleConditions;
  const packageDimensions = saleConditions?.packageDimensions ?? null;

  return {
    site_id: "MCO",
    family_name: familyName,
    category_id: listing.categoryId,
    price: listing.marketplacePrice,
    currency_id: "COP",
    available_quantity: availableQuantity,
    buying_mode: "buy_it_now",
    listing_type_id: listing.listingType || "gold_special",
    condition: "new",
    ...(saleConditions
      ? {
          shipping: {
            mode: saleConditions.shippingMode,
            free_shipping: saleConditions.freeShipping,
            local_pick_up: saleConditions.localPickUp,
            // Las mismas medidas con las que se cotizó el envío: sin ellas
            // Mercado Libre cobra por el peso que deduce de la categoría.
            ...(packageDimensions
              ? { dimensions: formatPackageDimensions(packageDimensions) }
              : {}),
          },
        }
      : {}),
    ...(listing.product.sku.trim()
      ? { seller_custom_field: listing.product.sku.trim() }
      : {}),
    // Mercado Libre descarga la foto una vez: la copia de 1600 px, no el original. El paquete
    // ya viene transformado (1200 px, JPG): una segunda transformación encima lo cambiaría.
    pictures: pictures.map((source) => ({ source: packPictures.length ? source : toGoogleMerchantImageUrl(source) })),
    attributes: addPackageDimensionAttributes(
      addProductIdentifiers(
        getConfiguredAttributes(listing.metadata),
        listing.product,
      ),
      packageDimensions,
    ),
  };
}

/** «AltoxAnchoxLargo,gramos», el formato que Mercado Libre usa para cotizar. */
export function formatPackageDimensions(dimensions: {
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  weightGrams: number;
}) {
  return `${dimensions.heightCm}x${dimensions.widthCm}x${dimensions.lengthCm},${dimensions.weightGrams}`;
}

function addPackageDimensionAttributes(
  attributes: MercadoLibreAttribute[],
  dimensions: {
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
  } | null,
) {
  if (!dimensions) return attributes;
  const configured = new Set(attributes.map((attribute) => attribute.id));
  const extra: MercadoLibreAttribute[] = [
    { id: "PACKAGE_HEIGHT", value_name: `${dimensions.heightCm} cm` },
    { id: "PACKAGE_WIDTH", value_name: `${dimensions.widthCm} cm` },
    { id: "PACKAGE_LENGTH", value_name: `${dimensions.lengthCm} cm` },
    { id: "PACKAGE_WEIGHT", value_name: `${dimensions.weightGrams} g` },
  ];
  return [...attributes, ...extra.filter((attribute) => !configured.has(attribute.id))];
}

function getApiError(status: number, payload: unknown) {
  return MercadoLibrePublicationError.fromFailure(
    mapMercadoLibreItemError(status, payload),
  );
}

/**
 * Candado de preventa. Un producto que se está vendiendo por adelantado no se
 * publica en Mercado Libre, tenga el stock que tenga: ver el porqué largo en
 * `lib/presale.ts`, resumido, que al liberar el stock sube de golpe y ML
 * podría vender unidades ya cobradas a una clienta de la tienda.
 */
async function assertNotInPresale(productId: string) {
  if (await isBlockedByPresaleForMercadoLibre(productId)) {
    throw new MercadoLibrePublicationError(PRESALE_BLOCKS_MARKETPLACE_MESSAGE, {
      requiresDraftReview: true,
    });
  }
}

const EMPTY_GTIN_GROUP = new Set(["GTIN", "EMPTY_GTIN_REASON"]);
const SALE_FORMAT_PACK = { id: "1359392", name: "pack" };

const attributeValueMatches = (attribute: MercadoLibreAttribute, values: { id: string; name: string }[]) =>
  values.some(
    (value) =>
      (attribute.value_id && attribute.value_id === value.id) ||
      (attribute.value_name && attribute.value_name.trim().toLowerCase() === value.name.trim().toLowerCase()),
  );

/**
 * Qué falta en la ficha frente a la categoría. Obligatorios: los `required` y
 * los `conditional_required` (GTIN o su motivo vacío, uno de los dos; las
 * unidades por paquete cuando el formato de venta es «Pack»; el resto, siempre).
 * Un valor de una lista cerrada (`list`) debe ser uno de sus valores. Los de
 * catálogo que faltan son avisos, no bloquean.
 */
export function checkMercadoLibreRequiredAttributes(
  categoryAttributes: MercadoLibreCategoryAttribute[],
  attributes: MercadoLibreAttribute[],
  product: Parameters<typeof shouldUseEmptyGtinReason>[0],
) {
  const byId = new Map(attributes.map((attribute) => [attribute.id, attribute]));
  const has = (id: string) => byId.has(id);
  const saleFormat = byId.get("SALE_FORMAT");
  const isPack = Boolean(
    saleFormat && (saleFormat.value_id === SALE_FORMAT_PACK.id || saleFormat.value_name?.trim().toLowerCase() === SALE_FORMAT_PACK.name),
  );
  const missing: string[] = [];
  const invalid: string[] = [];
  const warnings: string[] = [];
  let gtinGroupNeeded = false;
  for (const attribute of categoryAttributes) {
    if (attribute.required) {
      if (!has(attribute.id) && !(attribute.id === "GTIN" && shouldUseEmptyGtinReason(product))) missing.push(attribute.id);
    } else if (attribute.conditionalRequired) {
      if (EMPTY_GTIN_GROUP.has(attribute.id)) gtinGroupNeeded = true;
      else if (attribute.id === "UNITS_PER_PACK") {
        if (isPack && !has(attribute.id)) missing.push(attribute.id);
      } else if (!has(attribute.id)) missing.push(attribute.id);
    } else if (attribute.catalogRequired && !has(attribute.id)) {
      warnings.push(attribute.id);
    }
    const configured = byId.get(attribute.id);
    if (configured && attribute.valueType === "list" && attribute.values.length > 0 && !attribute.truncated && !attributeValueMatches(configured, attribute.values)) {
      invalid.push(`${attribute.id} (${configured.value_name ?? configured.value_id}; vale: ${attribute.values.map((value) => value.name).join(", ")})`);
    }
  }
  if (gtinGroupNeeded && !has("GTIN") && !has("EMPTY_GTIN_REASON")) missing.push("GTIN o EMPTY_GTIN_REASON");
  return { missing, invalid, warnings };
}

export async function validateMercadoLibreListingForPublication(
  listing: ListingForPublication,
  request: typeof fetch = mercadoLibreFetch,
  { categoryJson }: { categoryJson?: MercadoLibreCategoryJsonFetcher } = {},
): Promise<{ warnings: string[] }> {
  await assertNotInPresale(listing.product.id);
  const payload = buildItemPayload(listing);
  let categoryInspection: Awaited<ReturnType<typeof inspectMercadoLibreCategory>>;
  try {
    categoryInspection = await inspectMercadoLibreCategory(
      listing.connectionId,
      payload.category_id,
      {
        includeAttributes: true,
        requirements: {
          familyName: payload.family_name,
          price: payload.price,
          pictureCount: payload.pictures.length,
        },
        request,
        categoryJson,
      },
    );
  } catch (error) {
    if (error instanceof MercadoLibreReauthError) {
      throw new MercadoLibrePublicationError(MERCADOLIBRE_RECONNECT_MESSAGE, { kind: "reauth", step: null, field: null, code: null });
    }
    // La red o el token fallaron antes de saber nada de la categoría: no es
    // culpa del borrador, se reintenta.
    throw MercadoLibrePublicationError.fromFailure(
      transientPublicationFailure(
        `No fue posible validar la categoría en Mercado Libre: ${
          error instanceof Error ? error.message : "error de red"
        }. Se reintentará automáticamente.`,
      ),
    );
  }
  if (!categoryInspection.ok) {
    // Solo una categoría inválida devuelve el borrador; un 5xx/429 o un
    // token vencido no son un problema de la ficha.
    const kind: PublicationFailureKind =
      categoryInspection.code === MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE
        ? "transient"
        : categoryInspection.code === MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED
          ? "reauth"
          : "review";
    throw new MercadoLibrePublicationError(categoryInspection.message, {
      kind,
      step: kind === "review" ? "categoria" : null,
      field: kind === "review" ? "categoryId" : null,
      code: categoryInspection.code,
    });
  }
  const { missing: missingAttributes, invalid, warnings } = checkMercadoLibreRequiredAttributes(
    categoryInspection.attributes ?? [],
    payload.attributes,
    listing.product,
  );
  if (missingAttributes.length > 0) {
    throw new MercadoLibrePublicationError(
      `Completa los campos obligatorios de la ficha técnica antes de publicar: ${missingAttributes.join(", ")}.`,
      { kind: "review", step: "ficha", field: missingAttributes[0] },
    );
  }
  if (invalid.length > 0) {
    throw new MercadoLibrePublicationError(`Valor fuera de la lista de Mercado Libre: ${invalid.join("; ")}.`, {
      kind: "review",
      step: "ficha",
      field: invalid[0].split(" ")[0],
    });
  }
  await assertPicturesMeetMercadoLibreRules(payload.pictures.map((picture) => picture.source));
  return { warnings: warnings.map((id) => `Falta ${id} (lo pide el catálogo de Mercado Libre; no bloquea).`) };
}

/** JPG o PNG, hasta 10 MB y al menos 500 px por lado (reglas duras de Mercado Libre). */
async function assertPicturesMeetMercadoLibreRules(urls: string[]) {
  const results = await inspectRemotePictures(urls);
  const unreachable = results.find((result) => "unreachable" in result);
  if (unreachable && "unreachable" in unreachable) {
    throw MercadoLibrePublicationError.fromFailure(
      transientPublicationFailure(
        `No se pudo revisar la foto ${results.indexOf(unreachable) + 1} (${unreachable.unreachable}). Se reintentará automáticamente.`,
      ),
    );
  }
  const index = results.findIndex((result) => "check" in result && !result.check.ok);
  const failed = results[index];
  if (failed && "check" in failed) {
    throw new MercadoLibrePublicationError(`Foto ${index + 1}: ${failed.check.problems.map((problem) => problem.message).join(" ")}`, {
      kind: "review",
      step: "producto",
      field: "pictures",
      code: failed.check.problems[0]?.code ?? null,
    });
  }
}

/** Lo que se le manda a Mercado Libre: texto plano sin enlaces, contacto, HTML ni emojis. */
function mercadoLibreDescriptionText(description: string) {
  return inspectMercadoLibreDescription(richTextToPlainText(description)).clean.trim();
}

export function describeMercadoLibreDescriptionIssues(description: string): string | null {
  const { issues } = inspectMercadoLibreDescription(richTextToPlainText(description));
  if (issues.length === 0) return null;
  const kinds = Array.from(new Set(issues.map((issue) => DESCRIPTION_ISSUE_LABEL[issue.kind])));
  return `La descripción se envía sin ${kinds.join(", ")}: Mercado Libre no los permite.`;
}

async function createItemDescription(
  accessToken: string,
  itemId: string,
  description: string,
  request: typeof fetch,
) {
  const plainText = mercadoLibreDescriptionText(description);
  if (!plainText) return null;

  const response = await request(
    `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/description`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plain_text: plainText }),
      cache: "no-store",
    },
  );
  if (response.ok) return null;

  return getApiErrorMessage(await readJson(response));
}

async function updateItemDescription(
  accessToken: string,
  itemId: string,
  description: string,
  request: typeof fetch,
) {
  const plainText = mercadoLibreDescriptionText(description);
  if (!plainText) return;

  const currentDescription = await request(
    `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/description`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  const method = currentDescription.status === 404 ? "POST" : "PUT";
  if (!currentDescription.ok && method !== "POST") {
    throw getApiError(currentDescription.status, await readJson(currentDescription));
  }

  const response = await request(
    `https://api.mercadolibre.com/items/${encodeURIComponent(itemId)}/description`,
    {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ plain_text: plainText }),
      cache: "no-store",
    },
  );
  if (!response.ok) throw getApiError(response.status, await readJson(response));
}

type ListingForContentSync = ListingForPublication & {
  externalItemId: string;
};

/**
 * BRAND y LINE solo se mandan al crear o si la publicación aún no los tiene:
 * Mercado Libre puede rechazar o moderar un cambio de marca (sobre todo con
 * ventas) y eso tumbaría la edición entera.
 */
const KEEP_REMOTE_ON_UPDATE = new Set(["BRAND", "LINE"]);

function mergeRemoteAttributes(
  remoteAttributes: MercadoLibreAttribute[],
  listing: ListingForPublication,
) {
  const merged = new Map(
    remoteAttributes.map((attribute) => [attribute.id, attribute]),
  );
  for (const attribute of addProductIdentifiers(
    getConfiguredAttributes(listing.metadata),
    listing.product,
  )) {
    if (KEEP_REMOTE_ON_UPDATE.has(attribute.id) && merged.has(attribute.id)) continue;
    merged.set(attribute.id, attribute);
  }
  return Array.from(merged.values());
}

function getRemoteAttributes(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [] as MercadoLibreAttribute[];
  }
  const attributes = (payload as Record<string, unknown>).attributes;
  return getMercadoLibreAttributes({ attributes } as Prisma.JsonValue);
}

export async function syncMercadoLibreListingContent(
  listing: ListingForContentSync,
  request: typeof fetch = mercadoLibreFetch,
) {
  await assertMercadoLibreWritesAllowed(listing.connectionId);
  if (listing.product.isArchived) {
    throw new MercadoLibrePublicationError(
      "No puedes sincronizar el contenido de un producto archivado",
    );
  }
  const imageUrls = getMercadoLibreListingImageUrls(
    listing.product.images,
    listing.metadata,
  );
  if (imageUrls.length === 0) {
    throw new MercadoLibrePublicationError(
      "El producto necesita al menos una imagen para sincronizarse",
    );
  }
  await assertPicturesMeetMercadoLibreRules(imageUrls.map((source) => toGoogleMerchantImageUrl(source)));

  const accessToken = await getMercadoLibreAccessToken(listing.connectionId);
  const itemUrl = `https://api.mercadolibre.com/items/${encodeURIComponent(listing.externalItemId)}`;
  const existingItem = await request(itemUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const existingPayload = await readJson(existingItem);
  if (!existingItem.ok) throw getApiError(existingItem.status, existingPayload);

  const response = await request(itemUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pictures: imageUrls.map((source) => ({ source: toGoogleMerchantImageUrl(source) })),
      attributes: mergeRemoteAttributes(
        getRemoteAttributes(existingPayload),
        listing,
      ),
    }),
    cache: "no-store",
  });
  if (!response.ok) throw getApiError(response.status, await readJson(response));

  await updateItemDescription(
    accessToken,
    listing.externalItemId,
    mercadoLibreListingDescription(listing),
    request,
  );
}

/**
 * Solo crea el ítem (validación previa + POST /items) y devuelve su id. Quien
 * llama debe guardar ese id ANTES de cualquier otro paso remoto: un fallo
 * posterior sin el id guardado terminaba en una segunda publicación.
 */
/**
 * «Validar con Mercado Libre»: la misma carga que se publicaría, enviada a
 * `/items/validate`, que no crea nada. Antes se revisan la categoría y los
 * obligatorios en local, que nombran el campo vacío mejor que Mercado Libre.
 */
export async function validateMercadoLibreItemDraft(
  listing: ListingForPublication,
  request: typeof fetch = mercadoLibreFetch,
): Promise<MercadoLibreValidationResult> {
  try {
    await validateMercadoLibreListingForPublication(listing, request);
  } catch (error) {
    if (error instanceof MercadoLibrePublicationError) {
      return { ok: false, errors: [error.toFailure()], warnings: [] };
    }
    throw error;
  }
  const accessToken = await getMercadoLibreAccessToken(listing.connectionId);
  let response: Response;
  try {
    response = await request("https://api.mercadolibre.com/items/validate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildItemPayload(listing)),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      errors: [
        transientPublicationFailure(
          `No fue posible contactar a Mercado Libre: ${error instanceof Error ? error.message : "error de red"}. Vuelve a validar en un momento.`,
        ),
      ],
      warnings: [],
    };
  }
  const payload = response.status === 204 ? null : await readJson(response);
  const result = readMercadoLibreValidation(response.status, payload);
  const descriptionNote = describeMercadoLibreDescriptionIssues(mercadoLibreListingDescription(listing));
  return descriptionNote
    ? { ...result, warnings: [...result.warnings, { field: "description", code: "description_cleaned", message: descriptionNote }] }
    : result;
}

async function assertMercadoLibreValidates(
  listing: ListingForPublication,
  accessToken: string,
  request: typeof fetch,
) {
  let response: Response;
  try {
    response = await request("https://api.mercadolibre.com/items/validate", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildItemPayload(listing)),
      cache: "no-store",
    });
  } catch (error) {
    throw MercadoLibrePublicationError.fromFailure(
      transientPublicationFailure(
        `No fue posible validar con Mercado Libre: ${error instanceof Error ? error.message : "error de red"}. Se reintentará automáticamente.`,
      ),
    );
  }
  const payload = response.status === 204 ? null : await readJson(response);
  const validation = readMercadoLibreValidation(response.status, payload);
  if (!validation.ok) throw MercadoLibrePublicationError.fromFailure(validation.errors[0]);
}

export async function createMercadoLibreItem(
  listing: ListingForPublication,
  request: typeof fetch = mercadoLibreFetch,
): Promise<MercadoLibreCreatedItem> {
  await assertMercadoLibreWritesAllowed(listing.connectionId);
  await validateMercadoLibreListingForPublication(listing, request);

  await assertNotInPresale(listing.product.id);
  const accessToken = await getMercadoLibreAccessToken(listing.connectionId);
  // El servidor valida con Mercado Libre aunque la pantalla ya lo haya hecho:
  // un error real detiene la publicación; las advertencias solas no.
  await assertMercadoLibreValidates(listing, accessToken, request);
  let response: Response;
  try {
    response = await request("https://api.mercadolibre.com/items", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildItemPayload(listing)),
      cache: "no-store",
    });
  } catch (error) {
    throw MercadoLibrePublicationError.fromFailure(
      transientPublicationFailure(
        `No fue posible contactar a Mercado Libre: ${
          error instanceof Error ? error.message : "error de red"
        }. Se reintentará automáticamente.`,
      ),
    );
  }
  const payload = await readJson(response);
  if (!response.ok) {
    throw getApiError(response.status, payload);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new MercadoLibrePublicationError(
      "Mercado Libre no devolvió la publicación creada",
    );
  }

  const item = payload as Record<string, unknown>;
  if (typeof item.id !== "string" || !item.id) {
    throw new MercadoLibrePublicationError(
      "Mercado Libre no devolvió el identificador de la publicación",
    );
  }

  return {
    id: item.id,
    permalink: typeof item.permalink === "string" ? item.permalink : null,
    status: typeof item.status === "string" ? item.status : null,
    userProductId: typeof item.user_product_id === "string" && item.user_product_id ? item.user_product_id : null,
    familyId:
      typeof item.family_id === "number" || (typeof item.family_id === "string" && item.family_id)
        ? String(item.family_id)
        : null,
  };
}

/**
 * Paso aparte y de mejor esfuerzo: la descripción nunca decide si la
 * publicación existe. Devuelve el aviso a guardar en `lastError`, o null.
 */
export async function createMercadoLibreItemDescription(
  connectionId: string,
  itemId: string,
  description: string,
  request: typeof fetch = mercadoLibreFetch,
): Promise<string | null> {
  try {
    await assertMercadoLibreWritesAllowed(connectionId);
    const accessToken = await getMercadoLibreAccessToken(connectionId);
    return await createItemDescription(accessToken, itemId, description, request);
  } catch (error) {
    return `La descripción no se pudo enviar a Mercado Libre: ${
      error instanceof Error ? error.message : "error desconocido"
    }. Edítala en Mercado Libre.`;
  }
}

/** @deprecated Usa createMercadoLibreItem + createMercadoLibreItemDescription y guarda el id entre ambos. */
export async function publishMercadoLibreListing(
  listing: ListingForPublication,
  request: typeof fetch = mercadoLibreFetch,
): Promise<MercadoLibrePublishedItem> {
  const item = await createMercadoLibreItem(listing, request);
  return {
    ...item,
    descriptionWarning: await createMercadoLibreItemDescription(
      listing.connectionId,
      item.id,
      mercadoLibreListingDescription(listing),
      request,
    ),
  };
}
