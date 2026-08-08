import { Prisma } from "@prisma/client";

import { richTextToPlainText } from "@/lib/rich-text";

import { getMercadoLibreAccessToken } from "./client";
import {
  getMercadoLibreAttributes,
  getMercadoLibreListingImageUrls,
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
  };
};

type MercadoLibrePublishedItem = {
  id: string;
  permalink: string | null;
  status: string | null;
  descriptionWarning: string | null;
};

export class MercadoLibrePublicationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoLibrePublicationError";
  }
}

function getApiErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return "Mercado Libre rechazó la publicación";
  }
  const data = payload as Record<string, unknown>;
  const message = data.message ?? data.error;
  return typeof message === "string"
    ? message.slice(0, 1_000)
    : "Mercado Libre rechazó la publicación";
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
    );
  }
  if (!listing.categoryId) {
    throw new MercadoLibrePublicationError(
      "Selecciona una categoría de Mercado Libre antes de publicar",
    );
  }
  if (!listing.marketplacePrice || listing.marketplacePrice <= 0) {
    throw new MercadoLibrePublicationError(
      "Define un precio de Mercado Libre mayor que cero",
    );
  }
  if (listing.product.images.length === 0) {
    throw new MercadoLibrePublicationError(
      "El producto necesita al menos una imagen para publicarse",
    );
  }

  return {
    site_id: "MCO",
    title: listing.product.name.trim(),
    category_id: listing.categoryId,
    price: listing.marketplacePrice,
    currency_id: "COP",
    available_quantity: Math.max(
      0,
      listing.product.stock - listing.stockSafetyBuffer,
    ),
    buying_mode: "buy_it_now",
    listing_type_id: listing.listingType || "gold_special",
    condition: "new",
    seller_custom_field: listing.product.sku,
    pictures: getMercadoLibreListingImageUrls(
      listing.product.images,
      listing.metadata,
    ).map((source) => ({ source })),
    attributes: addProductIdentifiers(
      getConfiguredAttributes(listing.metadata),
      listing.product,
    ),
  };
}

function getApiError(payload: unknown) {
  const message = getApiErrorMessage(payload);
  return new MercadoLibrePublicationError(message);
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
    throw getApiError(await readJson(currentDescription));
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
  if (!response.ok) throw getApiError(await readJson(response));
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
  if (!existingItem.ok) throw getApiError(existingPayload);

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
  if (!response.ok) throw getApiError(await readJson(response));

  await updateItemDescription(
    accessToken,
    listing.externalItemId,
    listing.product.description,
    request,
  );
}

export async function publishMercadoLibreListing(
  listing: ListingForPublication,
  request: typeof fetch = fetch,
): Promise<MercadoLibrePublishedItem> {
  const accessToken = await getMercadoLibreAccessToken(listing.connectionId);
  const response = await request("https://api.mercadolibre.com/items", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildItemPayload(listing)),
    cache: "no-store",
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new MercadoLibrePublicationError(getApiErrorMessage(payload));
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
    descriptionWarning: await createItemDescription(
      accessToken,
      item.id,
      listing.product.description,
      request,
    ),
  };
}
