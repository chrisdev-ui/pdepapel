import { MarketplaceListingStatus, Prisma } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import { getMercadoLibreJson } from "./client";
import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceStockSyncEvents,
} from "./outbox";

const ITEM_SEARCH_LIMIT = 100;
const ITEM_BATCH_SIZE = 20;
const MAX_IMPORTED_LISTINGS = 5_000;

type RemoteListing = {
  externalItemId: string;
  externalVariationId: string | null;
  externalUserProductId: string | null;
  title: string;
  status: MarketplaceListingStatus;
  marketplacePrice: number | null;
  currencyId: string | null;
  categoryId: string | null;
  listingType: string | null;
  permalink: string | null;
  sellerSku: string | null;
  availableQuantity: number | null;
};

type LocalProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
};

export type MercadoLibreListingImportCandidate = RemoteListing & {
  key: string;
  existingListingId: string | null;
  linkedProduct: LocalProduct | null;
  suggestedProduct: LocalProduct | null;
  issue: string | null;
};

export type MercadoLibreListingImportPreview = {
  listings: MercadoLibreListingImportCandidate[];
  summary: {
    total: number;
    alreadyLinked: number;
    readyToImport: number;
    needsReview: number;
  };
};

export type MercadoLibreListingImportSelection = {
  externalItemId: string;
  externalVariationId: string | null;
  productId: string;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getOptionalString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function getOptionalNumber(value: unknown) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function getListingStatus(value: unknown) {
  switch (getOptionalString(value)?.toLowerCase()) {
    case "active":
      return MarketplaceListingStatus.ACTIVE;
    case "paused":
      return MarketplaceListingStatus.PAUSED;
    case "closed":
      return MarketplaceListingStatus.CLOSED;
    default:
      return MarketplaceListingStatus.ERROR;
  }
}

function getSellerSku(payload: Record<string, unknown>) {
  const directSku =
    getOptionalString(payload.seller_sku) ??
    getOptionalString(payload.seller_custom_field);
  if (directSku) return directSku;

  const attributes = Array.isArray(payload.attributes)
    ? payload.attributes
    : [];
  for (const attribute of attributes) {
    const value = asRecord(attribute);
    const id = getOptionalString(value?.id)?.toUpperCase();
    if (id !== "SELLER_SKU" && id !== "SELLER_CUSTOM_FIELD") continue;
    const sku =
      getOptionalString(value?.value_name) ??
      getOptionalString(value?.value_id);
    if (sku) return sku;
  }

  return null;
}

function getListingKey(
  externalItemId: string,
  externalVariationId: string | null,
) {
  return `${externalItemId}:${externalVariationId ?? ""}`;
}

export function parseMercadoLibreListing(
  payload: Record<string, unknown>,
): RemoteListing[] {
  const externalItemId = getOptionalString(payload.id);
  if (!externalItemId) return [];

  const base = {
    externalItemId,
    externalUserProductId: getOptionalString(payload.user_product_id),
    title: getOptionalString(payload.title) ?? "Publicación de Mercado Libre",
    status: getListingStatus(payload.status),
    marketplacePrice: getOptionalNumber(payload.price),
    currencyId: getOptionalString(payload.currency_id),
    categoryId: getOptionalString(payload.category_id),
    listingType: getOptionalString(payload.listing_type_id),
    permalink: getOptionalString(payload.permalink),
  };
  const variations = Array.isArray(payload.variations)
    ? payload.variations
    : [];

  if (variations.length === 0) {
    return [
      {
        ...base,
        externalVariationId: null,
        sellerSku: getSellerSku(payload),
        availableQuantity: getOptionalNumber(payload.available_quantity),
      },
    ];
  }

  return variations.flatMap((variation) => {
    const value = asRecord(variation);
    const externalVariationId = getOptionalString(value?.id);
    if (!value || !externalVariationId) return [];

    return [
      {
        ...base,
        externalVariationId,
        sellerSku: getSellerSku(value),
        marketplacePrice:
          getOptionalNumber(value.price) ?? base.marketplacePrice,
        availableQuantity: getOptionalNumber(value.available_quantity),
      },
    ];
  });
}

async function getSellerItemIds(connectionId: string, sellerId: string) {
  const getPage = async (query: string) => {
    const payload = await getMercadoLibreJson(
      connectionId,
      `/users/${encodeURIComponent(sellerId)}/items/search?${query}`,
    );
    const page = asRecord(payload);
    if (!page || !Array.isArray(page.results)) {
      throw new Error("Mercado Libre no devolvió publicaciones del vendedor");
    }
    return {
      ids: page.results.flatMap((value) => {
        const id = getOptionalString(value);
        return id ? [id] : [];
      }),
      total: getOptionalNumber(asRecord(page.paging)?.total),
      scrollId: getOptionalString(page.scroll_id),
    };
  };

  const firstPage = await getPage(`limit=${ITEM_SEARCH_LIMIT}&offset=0`);
  const total = firstPage.total ?? firstPage.ids.length;
  if (total > MAX_IMPORTED_LISTINGS) {
    throw new Error(
      "Hay demasiadas publicaciones para importar de una vez. Contacta soporte para hacer la importación por lotes.",
    );
  }
  if (total <= ITEM_SEARCH_LIMIT) return firstPage.ids;

  if (total <= 1_000) {
    const ids = [...firstPage.ids];
    for (
      let offset = ITEM_SEARCH_LIMIT;
      offset < total;
      offset += ITEM_SEARCH_LIMIT
    ) {
      const page = await getPage(`limit=${ITEM_SEARCH_LIMIT}&offset=${offset}`);
      ids.push(...page.ids);
    }
    return Array.from(new Set(ids));
  }

  const ids: string[] = [];
  let page = await getPage(`search_type=scan&limit=${ITEM_SEARCH_LIMIT}`);
  while (page.ids.length > 0) {
    ids.push(...page.ids);
    if (ids.length > MAX_IMPORTED_LISTINGS || !page.scrollId) break;
    page = await getPage(
      `search_type=scan&limit=${ITEM_SEARCH_LIMIT}&scroll_id=${encodeURIComponent(page.scrollId)}`,
    );
  }
  return Array.from(new Set(ids));
}

async function getRemoteListings(connectionId: string, sellerId: string) {
  const itemIds = await getSellerItemIds(connectionId, sellerId);
  const listings: RemoteListing[] = [];

  for (let index = 0; index < itemIds.length; index += ITEM_BATCH_SIZE) {
    const itemBatch = itemIds.slice(index, index + ITEM_BATCH_SIZE);
    const payload = await getMercadoLibreJson(
      connectionId,
      `/items?ids=${itemBatch.map(encodeURIComponent).join(",")}`,
    );
    if (!Array.isArray(payload)) {
      throw new Error(
        "Mercado Libre no devolvió el detalle de las publicaciones",
      );
    }
    for (const response of payload) {
      const item = asRecord(asRecord(response)?.body);
      if (item) listings.push(...parseMercadoLibreListing(item));
    }
  }

  return listings;
}

async function getImportCandidates(
  connectionId: string,
  storeId: string,
  sellerId: string,
) {
  const remoteListings = await getRemoteListings(connectionId, sellerId);
  const externalItemIds = Array.from(
    new Set(remoteListings.map((listing) => listing.externalItemId)),
  );
  const skus = Array.from(
    new Set(
      remoteListings.flatMap((listing) =>
        listing.sellerSku ? [listing.sellerSku] : [],
      ),
    ),
  );
  const [existingListings, products] = await Promise.all([
    prismadb.marketplaceListing.findMany({
      where: { connectionId, externalItemId: { in: externalItemIds } },
      select: {
        id: true,
        productId: true,
        externalItemId: true,
        externalVariationId: true,
        product: { select: { id: true, name: true, sku: true, stock: true } },
      },
    }),
    skus.length > 0
      ? prismadb.product.findMany({
          where: { storeId, sku: { in: skus }, isArchived: false },
          select: { id: true, name: true, sku: true, stock: true },
        })
      : Promise.resolve([]),
  ]);
  const productBySku = new Map(
    products.map((product) => [product.sku, product]),
  );
  const productListingById = new Map(
    existingListings.map((listing) => [listing.productId, listing]),
  );
  const listingByRemoteKey = new Map(
    existingListings.map((listing) => [
      getListingKey(listing.externalItemId!, listing.externalVariationId),
      listing,
    ]),
  );

  return remoteListings.map((listing): MercadoLibreListingImportCandidate => {
    const key = getListingKey(
      listing.externalItemId,
      listing.externalVariationId,
    );
    const existingListing = listingByRemoteKey.get(key) ?? null;
    const suggestedProduct = listing.sellerSku
      ? (productBySku.get(listing.sellerSku) ?? null)
      : null;
    const productListing = suggestedProduct
      ? (productListingById.get(suggestedProduct.id) ?? null)
      : null;
    const hasDifferentLocalLink =
      productListing?.externalItemId &&
      productListing.externalItemId !== listing.externalItemId;

    return {
      ...listing,
      key,
      existingListingId: existingListing?.id ?? null,
      linkedProduct: existingListing?.product ?? null,
      suggestedProduct,
      issue: existingListing
        ? null
        : !listing.sellerSku
          ? "La publicación no tiene SKU de vendedor"
          : !suggestedProduct
            ? "No existe un producto local con este SKU"
            : hasDifferentLocalLink
              ? "El producto local ya está vinculado a otra publicación"
              : null,
    };
  });
}

export async function previewMercadoLibreListingImport(
  connectionId: string,
  storeId: string,
  sellerId: string,
): Promise<MercadoLibreListingImportPreview> {
  const listings = await getImportCandidates(connectionId, storeId, sellerId);
  return {
    listings,
    summary: {
      total: listings.length,
      alreadyLinked: listings.filter((listing) => listing.existingListingId)
        .length,
      readyToImport: listings.filter(
        (listing) => !listing.existingListingId && !listing.issue,
      ).length,
      needsReview: listings.filter(
        (listing) => !listing.existingListingId && Boolean(listing.issue),
      ).length,
    },
  };
}

function getRemoteSelectionKey(selection: MercadoLibreListingImportSelection) {
  return getListingKey(selection.externalItemId, selection.externalVariationId);
}

function canSynchronizeStock(status: MarketplaceListingStatus) {
  return (
    status === MarketplaceListingStatus.ACTIVE ||
    status === MarketplaceListingStatus.PAUSED
  );
}

export async function importMercadoLibreListings({
  connectionId,
  storeId,
  sellerId,
  selections,
}: {
  connectionId: string;
  storeId: string;
  sellerId: string;
  selections: MercadoLibreListingImportSelection[];
}) {
  if (selections.length === 0) {
    throw new Error("Selecciona al menos una publicación para importar");
  }
  if (selections.length > 500) {
    throw new Error("Puedes importar máximo 500 publicaciones a la vez");
  }

  const uniqueSelectionKeys = new Set(selections.map(getRemoteSelectionKey));
  const uniqueProductIds = new Set(
    selections.map((selection) => selection.productId),
  );
  if (
    uniqueSelectionKeys.size !== selections.length ||
    uniqueProductIds.size !== selections.length
  ) {
    throw new Error(
      "Cada publicación y cada producto local solo pueden vincularse una vez",
    );
  }

  const candidates = await getImportCandidates(connectionId, storeId, sellerId);
  const remoteListingByKey = new Map(
    candidates.map((listing) => [listing.key, listing]),
  );
  const selectedListings = selections.map((selection) => {
    const listing = remoteListingByKey.get(getRemoteSelectionKey(selection));
    if (!listing) {
      throw new Error("Una publicación ya no está disponible en Mercado Libre");
    }
    if (listing.existingListingId) {
      throw new Error("Una de las publicaciones ya está vinculada");
    }
    if (listing.status === MarketplaceListingStatus.ERROR) {
      throw new Error("Una publicación tiene un estado no compatible");
    }
    return { listing, productId: selection.productId };
  });

  const productIds = Array.from(uniqueProductIds);
  const result = await prismadb.$transaction(async (transaction) => {
    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, storeId, isArchived: false },
      select: { id: true, stock: true },
    });
    if (products.length !== productIds.length) {
      throw new Error("Uno de los productos locales no está disponible");
    }

    const existingByProduct = new Map(
      (
        await transaction.marketplaceListing.findMany({
          where: { connectionId, productId: { in: productIds } },
          select: {
            id: true,
            productId: true,
            externalItemId: true,
            externalVariationId: true,
            stockSafetyBuffer: true,
          },
        })
      ).map((listing) => [listing.productId, listing]),
    );
    const existingByRemoteKey = new Map(
      (
        await transaction.marketplaceListing.findMany({
          where: {
            connectionId,
            externalItemId: {
              in: selectedListings.map(({ listing }) => listing.externalItemId),
            },
          },
          select: {
            id: true,
            productId: true,
            externalItemId: true,
            externalVariationId: true,
          },
        })
      ).map((listing) => [
        getListingKey(listing.externalItemId!, listing.externalVariationId),
        listing,
      ]),
    );

    const importedListingIds: string[] = [];
    for (const { listing, productId } of selectedListings) {
      const existingProductListing = existingByProduct.get(productId);
      const existingRemoteListing = existingByRemoteKey.get(listing.key);
      if (
        existingProductListing?.externalItemId &&
        existingProductListing.externalItemId !== listing.externalItemId
      ) {
        throw new Error(
          "Un producto local ya está vinculado a otra publicación de Mercado Libre",
        );
      }
      if (
        existingRemoteListing &&
        existingRemoteListing.productId !== productId
      ) {
        throw new Error(
          "Una publicación de Mercado Libre ya está vinculada a otro producto local",
        );
      }

      const syncStock = canSynchronizeStock(listing.status);
      const listingData = {
        externalItemId: listing.externalItemId,
        externalVariationId: listing.externalVariationId,
        externalUserProductId: listing.externalUserProductId,
        externalPermalink: listing.permalink,
        title: listing.title,
        categoryId: listing.categoryId,
        listingType: listing.listingType,
        marketplacePrice: listing.marketplacePrice,
        syncStock,
        syncPrice: false,
        status: listing.status,
        lastSyncedStock: listing.availableQuantity,
        lastSyncedPrice: listing.marketplacePrice,
        lastRemoteUpdateAt: new Date(),
        lastError: null,
      };
      const importedListing = existingProductListing
        ? await transaction.marketplaceListing.update({
            where: { id: existingProductListing.id },
            data: listingData,
            select: { id: true },
          })
        : await transaction.marketplaceListing.create({
            data: {
              connectionId,
              productId,
              stockSafetyBuffer: 0,
              metadata: {
                attributes: [],
                source: "MERCADOLIBRE_IMPORT",
              } as Prisma.InputJsonValue,
              ...listingData,
            },
            select: { id: true },
          });
      importedListingIds.push(importedListing.id);
    }

    await queueMarketplaceStockSyncEvents(transaction, productIds);
    return importedListingIds;
  });

  let queuedStockEvents = 0;
  try {
    queuedStockEvents =
      await enqueuePendingMarketplaceOutboxEvents(connectionId);
  } catch (error) {
    console.error("Mercado Libre listing import stock dispatch deferred", {
      message: error instanceof Error ? error.message : "unknown",
    });
  }

  return { importedCount: result.length, queuedStockEvents };
}
