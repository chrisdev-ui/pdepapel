import { Prisma } from "@prisma/client";

import { richTextToPlainText } from "@/lib/rich-text";

import { getMercadoLibreAccessToken } from "./client";

export type MercadoLibreAttribute = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

type ListingForPublication = {
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
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [] as MercadoLibreAttribute[];
  }
  const attributes = (metadata as Record<string, unknown>).attributes;
  if (!Array.isArray(attributes)) return [];

  return attributes.flatMap((attribute) => {
    if (
      !attribute ||
      typeof attribute !== "object" ||
      Array.isArray(attribute)
    ) {
      return [];
    }
    const value = attribute as Record<string, unknown>;
    if (typeof value.id !== "string" || !value.id.trim()) return [];
    const valueId =
      typeof value.value_id === "string" && value.value_id.trim()
        ? value.value_id.trim()
        : null;
    const valueName =
      typeof value.value_name === "string" && value.value_name.trim()
        ? value.value_name.trim()
        : null;
    if (!valueId && !valueName) return [];

    return [
      {
        id: value.id.trim(),
        ...(valueId ? { value_id: valueId } : {}),
        ...(valueName ? { value_name: valueName } : {}),
      },
    ];
  });
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
    pictures: listing.product.images.map((image) => ({ source: image.url })),
    attributes: addProductIdentifiers(
      getConfiguredAttributes(listing.metadata),
      listing.product,
    ),
  };
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
