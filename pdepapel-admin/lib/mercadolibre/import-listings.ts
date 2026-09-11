import { MarketplaceListingStatus, Prisma } from "@prisma/client";

import { AppError, ErrorFactory } from "@/lib/api-errors";
import { mapWithConcurrency } from "@/lib/concurrency";
import prismadb from "@/lib/prismadb";

import { getMercadoLibreJson, requestMercadoLibreJson } from "./client";
import { getMarketplaceListingStatusFromRemote } from "./listings";
import {
  enqueuePendingMarketplaceOutboxEvents,
  queueMarketplaceStockSyncEvents,
} from "./outbox";

const ITEM_SEARCH_LIMIT = 100;
const ITEM_BATCH_SIZE = 20;
const MAX_IMPORTED_LISTINGS = 5_000;
/** Multigets de `/items` en vuelo a la vez: Mercado Libre limita por aplicación. */
const ITEM_BATCH_CONCURRENCY = 3;
/** Moneda de la tienda: cualquier otra se avisa, porque el panel muestra pesos. */
const STORE_CURRENCY = "COP";
export const IMPORT_SOURCE = "MERCADOLIBRE_IMPORT";

type RemoteListing = {
  externalItemId: string;
  externalVariationId: string | null;
  externalUserProductId: string | null;
  title: string;
  status: MarketplaceListingStatus;
  /** Aviso de la tabla de estados compartida (en revisión, pago pendiente…). */
  statusNote: string | null;
  marketplacePrice: number | null;
  currencyId: string | null;
  /** Publicación de catálogo: Mercado Libre controla precio y competencia. */
  catalogListing: boolean;
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
  /** Borrador local del producto sugerido: vincular lo reemplazaría. */
  draftListingId: string | null;
  /** Impide proponerla automáticamente; se resuelve a mano. */
  issue: string | null;
  /** No bloquea, pero la persona debe verlo antes de vincular. */
  warnings: string[];
};

export type MercadoLibreListingImportPreview = {
  listings: MercadoLibreListingImportCandidate[];
  summary: {
    total: number;
    alreadyLinked: number;
    readyToImport: number;
    needsReview: number;
    /** Publicaciones que Mercado Libre no devolvió en esta revisión. */
    unavailable: number;
  };
  /** true cuando alguna tanda falló y la lista está incompleta. */
  partial: boolean;
};

export type MercadoLibreListingImportSelection = {
  externalItemId: string;
  externalVariationId: string | null;
  productId: string;
  /** Confirmación explícita para reemplazar un borrador local del producto. */
  replaceDraft?: boolean;
};

/** Borradores locales por producto (sin id en Mercado Libre). */
async function getDraftListingIdsByProduct(connectionId: string) {
  const drafts = await prismadb.marketplaceListing.findMany({
    where: { connectionId, externalItemId: null },
    select: { id: true, productId: true, title: true },
  });
  return new Map(drafts.map((draft) => [draft.productId, draft]));
}

function describeListing(
  listing: Pick<RemoteListing, "title" | "externalItemId" | "externalVariationId">,
) {
  return `«${listing.title}» (${listing.externalItemId}${listing.externalVariationId ? ` · variación ${listing.externalVariationId}` : ""})`;
}

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

  // Misma tabla de estados que la publicación y la cola: `under_review` y
  // `payment_required` quedan pausadas con su aviso, no en error.
  const mappedStatus = getMarketplaceListingStatusFromRemote(
    getOptionalString(payload.status)?.toLowerCase() ?? null,
  );
  const base = {
    externalItemId,
    externalUserProductId: getOptionalString(payload.user_product_id),
    title: getOptionalString(payload.title) ?? "Publicación de Mercado Libre",
    status: mappedStatus.status,
    statusNote: mappedStatus.note,
    marketplacePrice: getOptionalNumber(payload.price),
    currencyId: getOptionalString(payload.currency_id),
    catalogListing: payload.catalog_listing === true,
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
      throw new AppError(
        "Mercado Libre no devolvió publicaciones del vendedor. Intenta de nuevo en unos minutos.",
        502,
      );
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
    throw ErrorFactory.InvalidRequest(
      `Hay más de ${MAX_IMPORTED_LISTINGS} publicaciones en la cuenta; la importación por lotes todavía no está disponible. Contacta soporte.`,
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

/**
 * Detalle de los ítems por tandas de 20 (el máximo del multiget), de a pocas
 * a la vez. Una tanda que Mercado Libre no responde no tira toda la revisión:
 * sus ítems se cuentan como no disponibles y se informan. Un 401 sí corta,
 * porque hay que reconectar la cuenta.
 */
export async function getRemoteListingsByIds(
  connectionId: string,
  itemIds: string[],
): Promise<{ listings: RemoteListing[]; unavailableItemIds: string[] }> {
  const batches: string[][] = [];
  for (let index = 0; index < itemIds.length; index += ITEM_BATCH_SIZE) {
    batches.push(itemIds.slice(index, index + ITEM_BATCH_SIZE));
  }
  const results = await mapWithConcurrency(
    batches,
    ITEM_BATCH_CONCURRENCY,
    async (itemBatch) => {
      const response = await requestMercadoLibreJson(
        connectionId,
        `/items?ids=${itemBatch.map(encodeURIComponent).join(",")}`,
      );
      if (response.status === 401 || response.status === 403) {
        throw new AppError(
          "Mercado Libre no autorizó la consulta. Reconecta la cuenta y vuelve a intentarlo.",
          401,
          { upstreamStatus: response.status },
        );
      }
      if (!response.ok || !Array.isArray(response.payload)) {
        return { listings: [] as RemoteListing[], unavailableItemIds: itemBatch };
      }
      const listings: RemoteListing[] = [];
      const seen = new Set<string>();
      for (const entry of response.payload) {
        const item = asRecord(asRecord(entry)?.body);
        if (!item) continue;
        const parsed = parseMercadoLibreListing(item);
        parsed.forEach((listing) => seen.add(listing.externalItemId));
        listings.push(...parsed);
      }
      return {
        listings,
        unavailableItemIds: itemBatch.filter((id) => !seen.has(id)),
      };
    },
  );
  return {
    listings: results.flatMap((result) => result.listings),
    unavailableItemIds: results.flatMap((result) => result.unavailableItemIds),
  };
}

async function getRemoteListings(connectionId: string, sellerId: string) {
  const itemIds = await getSellerItemIds(connectionId, sellerId);
  return getRemoteListingsByIds(connectionId, itemIds);
}

async function getImportCandidates(
  connectionId: string,
  storeId: string,
  sellerId: string,
) {
  const { listings: remoteListings, unavailableItemIds } =
    await getRemoteListings(connectionId, sellerId);
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
  const [existingListings, products, draftsByProduct] = await Promise.all([
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
    getDraftListingIdsByProduct(connectionId),
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

  const candidateDetails = remoteListings.map((listing) => {
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
      Boolean(productListing?.externalItemId) &&
      getListingKey(
        productListing!.externalItemId!,
        productListing!.externalVariationId,
      ) !== key;

    return {
      listing,
      key,
      existingListing,
      suggestedProduct,
      hasDifferentLocalLink,
    };
  });

  const suggestedProductCounts = new Map<string, number>();
  for (const candidate of candidateDetails) {
    if (
      candidate.existingListing ||
      !candidate.suggestedProduct ||
      candidate.hasDifferentLocalLink
    ) {
      continue;
    }
    suggestedProductCounts.set(
      candidate.suggestedProduct.id,
      (suggestedProductCounts.get(candidate.suggestedProduct.id) ?? 0) + 1,
    );
  }

  const candidates = candidateDetails.map(
    ({
      listing,
      key,
      existingListing,
      suggestedProduct,
      hasDifferentLocalLink,
    }): MercadoLibreListingImportCandidate => {
      const hasDuplicateSuggestedProduct =
        Boolean(suggestedProduct) &&
        (suggestedProductCounts.get(suggestedProduct!.id) ?? 0) > 1;
      const draft =
        suggestedProduct && !existingListing
          ? (draftsByProduct.get(suggestedProduct.id) ?? null)
          : null;
      const warnings: string[] = [];
      if (draft) {
        warnings.push(
          "El producto local ya tiene un borrador en Administración; al vincular se reemplazará por esta publicación.",
        );
      }
      if (listing.currencyId && listing.currencyId !== STORE_CURRENCY) {
        warnings.push(
          `La publicación está en ${listing.currencyId}; el precio se guarda tal cual y el panel lo muestra como pesos.`,
        );
      }
      if (listing.catalogListing) {
        warnings.push(
          "Publicación de catálogo: Mercado Libre controla el precio y la competencia; el precio local no se enviará.",
        );
      }
      if (listing.statusNote) warnings.push(listing.statusNote);

      return {
        ...listing,
        key,
        existingListingId: existingListing?.id ?? null,
        linkedProduct: existingListing?.product ?? null,
        suggestedProduct,
        draftListingId: draft?.id ?? null,
        warnings,
        issue: existingListing
          ? null
          : !listing.sellerSku
            ? "La publicación no tiene SKU de vendedor"
            : !suggestedProduct
              ? "No existe un producto local con este SKU"
              : hasDifferentLocalLink
                ? "El producto local ya está vinculado a otra publicación o variación"
                : hasDuplicateSuggestedProduct
                  ? "Este mismo SKU aparece en varias publicaciones o variaciones. Revisa manualmente cuál corresponde a cada producto local."
                  : null,
      };
    },
  );
  return { candidates, unavailableItemIds };
}

export async function previewMercadoLibreListingImport(
  connectionId: string,
  storeId: string,
  sellerId: string,
): Promise<MercadoLibreListingImportPreview> {
  const { candidates: listings, unavailableItemIds } =
    await getImportCandidates(connectionId, storeId, sellerId);
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
      unavailable: unavailableItemIds.length,
    },
    partial: unavailableItemIds.length > 0,
  };
}

function getRemoteSelectionKey(selection: MercadoLibreListingImportSelection) {
  return getListingKey(selection.externalItemId, selection.externalVariationId);
}

export function getMercadoLibreListingImportSelectionError(
  selections: MercadoLibreListingImportSelection[],
) {
  const uniqueSelectionKeys = new Set(selections.map(getRemoteSelectionKey));
  if (uniqueSelectionKeys.size !== selections.length) {
    return "Una misma publicación o variación fue seleccionada más de una vez";
  }

  const uniqueProductIds = new Set(
    selections.map((selection) => selection.productId),
  );
  if (uniqueProductIds.size !== selections.length) {
    return "Un mismo producto local fue elegido para varias publicaciones. Deja una sola publicación vinculada a cada producto y revisa las demás.";
  }

  return null;
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
    throw ErrorFactory.InvalidRequest(
      "Selecciona al menos una publicación para importar",
    );
  }
  if (selections.length > 500) {
    throw ErrorFactory.InvalidRequest(
      "Puedes importar máximo 500 publicaciones a la vez",
    );
  }

  const selectionError = getMercadoLibreListingImportSelectionError(selections);
  if (selectionError) {
    throw ErrorFactory.InvalidRequest(selectionError);
  }

  // Solo se vuelven a leer los ítems elegidos (no toda la cuenta): son como
  // máximo 25 consultas y confirman que siguen existiendo tal como se vieron.
  const selectedItemIds = Array.from(
    new Set(selections.map((selection) => selection.externalItemId)),
  );
  const { listings: remoteListings, unavailableItemIds } =
    await getRemoteListingsByIds(connectionId, selectedItemIds);
  if (unavailableItemIds.length > 0) {
    throw new AppError(
      `Mercado Libre no respondió por ${unavailableItemIds.length === 1 ? "la publicación" : "las publicaciones"} ${unavailableItemIds.join(", ")}. Vuelve a intentarlo en unos minutos.`,
      502,
      { unavailableItemIds },
    );
  }
  const remoteListingByKey = new Map(
    remoteListings.map((listing) => [
      getListingKey(listing.externalItemId, listing.externalVariationId),
      listing,
    ]),
  );
  const selectedListings = selections.map((selection) => {
    const listing = remoteListingByKey.get(getRemoteSelectionKey(selection));
    if (!listing) {
      throw ErrorFactory.Conflict(
        `La publicación ${selection.externalItemId}${selection.externalVariationId ? ` (variación ${selection.externalVariationId})` : ""} ya no existe en Mercado Libre. Vuelve a revisar las publicaciones antes de continuar.`,
      );
    }
    if (listing.status === MarketplaceListingStatus.ERROR) {
      throw ErrorFactory.InvalidRequest(
        `${describeListing(listing)} tiene un estado que no se puede vincular${listing.statusNote ? `: ${listing.statusNote}` : ""}.`,
      );
    }
    return {
      listing,
      productId: selection.productId,
      replaceDraft: selection.replaceDraft === true,
    };
  });

  const productIds = Array.from(
    new Set(selections.map((selection) => selection.productId)),
  );
  const result = await prismadb.$transaction(async (transaction) => {
    const products = await transaction.product.findMany({
      where: { id: { in: productIds }, storeId, isArchived: false },
      select: { id: true, stock: true },
    });
    if (products.length !== productIds.length) {
      throw ErrorFactory.Conflict("Uno de los productos locales no está disponible");
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
            metadata: true,
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

    const imported: {
      listingId: string;
      externalItemId: string;
      externalVariationId: string | null;
      title: string;
      replacedDraft: boolean;
    }[] = [];
    for (const { listing, productId, replaceDraft } of selectedListings) {
      const key = getListingKey(listing.externalItemId, listing.externalVariationId);
      const existingProductListing = existingByProduct.get(productId);
      const existingRemoteListing = existingByRemoteKey.get(key);
      if (existingRemoteListing && existingRemoteListing.productId === productId) {
        throw ErrorFactory.Conflict(
          `${describeListing(listing)} ya está vinculada a este producto.`,
        );
      }
      if (
        existingProductListing?.externalItemId &&
        getListingKey(
          existingProductListing.externalItemId,
          existingProductListing.externalVariationId,
        ) !== key
      ) {
        throw ErrorFactory.Conflict(
          `El producto elegido para ${describeListing(listing)} ya está vinculado a otra publicación de Mercado Libre (${existingProductListing.externalItemId}).`,
        );
      }
      if (
        existingRemoteListing &&
        existingRemoteListing.productId !== productId
      ) {
        throw ErrorFactory.Conflict(
          `${describeListing(listing)} ya está vinculada a otro producto local.`,
        );
      }
      // Un borrador del asistente nunca se reemplaza sin decirlo: la persona
      // lo confirma fila por fila en la revisión.
      const replacesDraft = Boolean(
        existingProductListing && !existingProductListing.externalItemId,
      );
      if (replacesDraft && !replaceDraft) {
        throw ErrorFactory.Conflict(
          `El producto elegido para ${describeListing(listing)} ya tiene un borrador en Administración. Marca «Reemplazar el borrador» en esa fila para continuar.`,
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
        lastError: listing.statusNote,
      };
      const importedListing = existingProductListing
        ? await transaction.marketplaceListing.update({
            where: { id: existingProductListing.id },
            data: {
              ...listingData,
              // Un borrador reemplazado pasa a ser importación: la marca y la
              // moneda se agregan sin perder el resto de sus metadatos.
              metadata: {
                ...(existingProductListing.metadata &&
                typeof existingProductListing.metadata === "object" &&
                !Array.isArray(existingProductListing.metadata)
                  ? (existingProductListing.metadata as Record<string, unknown>)
                  : { attributes: [] }),
                source: IMPORT_SOURCE,
                currencyId: listing.currencyId,
                catalogListing: listing.catalogListing,
              } as Prisma.InputJsonValue,
            },
            select: { id: true },
          })
        : await transaction.marketplaceListing.create({
            data: {
              connectionId,
              productId,
              stockSafetyBuffer: 0,
              metadata: {
                attributes: [],
                source: IMPORT_SOURCE,
                currencyId: listing.currencyId,
                catalogListing: listing.catalogListing,
              } as Prisma.InputJsonValue,
              ...listingData,
            },
            select: { id: true },
          });
      imported.push({
        listingId: importedListing.id,
        externalItemId: listing.externalItemId,
        externalVariationId: listing.externalVariationId,
        title: listing.title,
        replacedDraft: replacesDraft,
      });
    }

    await queueMarketplaceStockSyncEvents(transaction, productIds);
    return imported;
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

  return { importedCount: result.length, imported: result, queuedStockEvents };
}
