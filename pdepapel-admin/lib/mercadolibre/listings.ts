import { MarketplaceListingStatus, Prisma } from "@prisma/client";

import { richTextToPlainText } from "@/lib/rich-text";

import {
  MERCADOLIBRE_CATEGORY_REAUTH_REQUIRED,
  MERCADOLIBRE_CATEGORY_SERVICE_UNAVAILABLE,
} from "./categories";
import { inspectMercadoLibreCategory } from "./category-validation";
import { isPriceBelowCost } from "./listing-price-guard";
import {
  mapMercadoLibreItemError,
  transientPublicationFailure,
  type PublicationFailure,
  type PublicationFailureKind,
  type PublicationWizardStep,
} from "./publication-error";
import { getMercadoLibreAccessToken } from "./client";
import {
  getMercadoLibreAttributes,
  getMercadoLibreListingImageUrls,
  getMercadoLibreListingMetadata,
  type MercadoLibreAttribute,
} from "./listing-metadata";

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
    sku: string;
    brand: string | null;
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

  if (product.brand && !configuredIds.has("BRAND")) {
    result.push({ id: "BRAND", value_name: product.brand });
  }
  if (product.mpn && !configuredIds.has("MPN")) {
    result.push({ id: "MPN", value_name: product.mpn });
  }
  if (product.gtin && !configuredIds.has("GTIN")) {
    result.push({ id: "GTIN", value_name: product.gtin });
  }

  return result;
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
  const pictures = getMercadoLibreListingImageUrls(
    listing.product.images,
    listing.metadata,
  );
  if (pictures.length === 0) {
    throw new MercadoLibrePublicationError(
      "El producto necesita al menos una imagen para publicarse",
      { requiresDraftReview: true },
    );
  }
  const availableQuantity = Math.max(
    0,
    listing.product.stock - listing.stockSafetyBuffer,
  );
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
    pictures: pictures.map((source) => ({ source })),
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

export async function validateMercadoLibreListingForPublication(
  listing: ListingForPublication,
  request: typeof fetch = fetch,
) {
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
      },
    );
  } catch (error) {
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
  const requiredAttributeIds = (categoryInspection.attributes ?? [])
    .filter((attribute) => attribute.required)
    .map((attribute) => attribute.id);
  const configuredAttributeIds = new Set(
    payload.attributes.map((attribute) => attribute.id),
  );
  // Un producto marcado «sin identificador» no puede aportar GTIN y no se
  // inventa: la exigencia local se levanta; si Mercado Libre insiste, su
  // rechazo llega mapeado al campo.
  const missingAttributes = requiredAttributeIds.filter(
    (attributeId) =>
      !configuredAttributeIds.has(attributeId) &&
      !(listing.product.hasNoProductIdentifier && attributeId === "GTIN"),
  );
  if (missingAttributes.length > 0) {
    throw new MercadoLibrePublicationError(
      `Completa los campos obligatorios de la ficha técnica antes de publicar: ${missingAttributes.join(", ")}.`,
      { kind: "review", step: "ficha", field: missingAttributes[0] },
    );
  }
}

async function createItemDescription(
  accessToken: string,
  itemId: string,
  description: string,
  request: typeof fetch,
) {
  const plainText = richTextToPlainText(description).trim();
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
  const plainText = richTextToPlainText(description).trim();
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
  request: typeof fetch = fetch,
) {
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
      pictures: imageUrls.map((source) => ({ source })),
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
    listing.product.description,
    request,
  );
}

/**
 * Solo crea el ítem (validación previa + POST /items) y devuelve su id. Quien
 * llama debe guardar ese id ANTES de cualquier otro paso remoto: un fallo
 * posterior sin el id guardado terminaba en una segunda publicación.
 */
export async function createMercadoLibreItem(
  listing: ListingForPublication,
  request: typeof fetch = fetch,
): Promise<MercadoLibreCreatedItem> {
  await validateMercadoLibreListingForPublication(listing, request);

  const accessToken = await getMercadoLibreAccessToken(listing.connectionId);
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
  request: typeof fetch = fetch,
): Promise<string | null> {
  try {
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
  request: typeof fetch = fetch,
): Promise<MercadoLibrePublishedItem> {
  const item = await createMercadoLibreItem(listing, request);
  return {
    ...item,
    descriptionWarning: await createMercadoLibreItemDescription(
      listing.connectionId,
      item.id,
      listing.product.description,
      request,
    ),
  };
}
