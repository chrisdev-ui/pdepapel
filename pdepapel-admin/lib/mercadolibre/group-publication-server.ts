import { randomUUID } from "node:crypto";

import {
  MarketplaceConnectionStatus,
  MarketplaceProvider,
  Prisma,
} from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { GALLERY_ORDER } from "@/lib/variant-gallery";

import { MercadoLibreReauthError } from "./client";
import {
  describeGroupVariantState,
  getGroupVariantState,
  MAX_GROUP_PUBLICATION_VARIANTS,
  type GroupVariantRemoteItem,
  type GroupVariantState,
} from "./group-publication";
import {
  buildMercadoLibreListingMetadata,
  getMercadoLibreListingMetadata,
  type MercadoLibreAttribute,
  type MercadoLibreSaleConditions,
} from "./listing-metadata";
import { evaluateListingPrice } from "./listing-price-guard";
import { MERCADOLIBRE_MAX_LISTING_PICTURES } from "./listings";
import { findSellerItemsBySku } from "./publish-attempt";

export type RemoteSkuLookup = (connectionId: string, sku: string) => Promise<GroupVariantRemoteItem[]>;

const IDENTIFIER_ATTRIBUTE_IDS = new Set(["GTIN", "MPN", "SELLER_SKU"]);
const LOOKUP_CONCURRENCY = 4;

const variantSelect = {
  id: true,
  name: true,
  sku: true,
  stock: true,
  price: true,
  acqPrice: true,
  transportationCost: true,
  isArchived: true,
  isKit: true,
  brand: true,
  gtin: true,
  mpn: true,
  hasNoProductIdentifier: true,
  color: { select: { name: true } },
  size: { select: { name: true } },
  design: { select: { name: true } },
  images: { select: { url: true }, orderBy: GALLERY_ORDER, take: MERCADOLIBRE_MAX_LISTING_PICTURES },
} satisfies Prisma.ProductSelect;

type VariantRow = Prisma.ProductGetPayload<{ select: typeof variantSelect }>;

async function loadMaster(storeId: string, listingId: string) {
  const master = await prismadb.marketplaceListing.findFirst({
    where: { id: listingId, connection: { storeId, provider: MarketplaceProvider.MERCADOLIBRE } },
    select: {
      id: true,
      productId: true,
      connectionId: true,
      categoryId: true,
      listingType: true,
      marketplacePrice: true,
      stockSafetyBuffer: true,
      syncStock: true,
      syncPrice: true,
      minimumMarginAmount: true,
      metadata: true,
      connection: { select: { status: true } },
      product: { select: { productGroupId: true, productGroup: { select: { id: true, name: true, brand: true } } } },
    },
  });
  if (!master) throw ErrorFactory.NotFound("Publicación no encontrada");
  const group = master.product.productGroup;
  if (!master.product.productGroupId || !group) {
    throw ErrorFactory.InvalidRequest("Este producto no pertenece a un grupo de variantes");
  }
  return { ...master, group };
}

async function lookupRemote(lookup: RemoteSkuLookup, connectionId: string, sku: string) {
  if (!sku.trim()) return [];
  try {
    return await lookup(connectionId, sku);
  } catch (error) {
    if (error instanceof MercadoLibreReauthError) throw error;
    return null;
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(LOOKUP_CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

export type GroupPublicationPlanVariant = {
  productId: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  acqPrice: number | null;
  transportationCost: number | null;
  isKit: boolean;
  brand: string | null;
  gtin: string | null;
  mpn: string | null;
  hasNoProductIdentifier: boolean;
  colorName: string | null;
  sizeName: string | null;
  designName: string | null;
  imageUrls: string[];
  isMaster: boolean;
  listingId: string | null;
  state: GroupVariantState;
  /** Ítems de Mercado Libre con este SKU (la publicación y sus gemelas). */
  remoteItems: GroupVariantRemoteItem[];
};

export type GroupPublicationPlan = {
  master: {
    listingId: string;
    productId: string;
    familyName: string | null;
    categoryId: string | null;
    listingType: string | null;
    marketplacePrice: number | null;
    stockSafetyBuffer: number;
    attributes: MercadoLibreAttribute[];
    saleConditions: MercadoLibreSaleConditions | null;
  };
  group: { id: string; name: string; brand: string | null };
  variants: GroupPublicationPlanVariant[];
  /** El grupo tiene más variantes de las que se revisan de una vez. */
  truncated: boolean;
};

export async function loadGroupPublicationPlan(
  storeId: string,
  listingId: string,
  lookup: RemoteSkuLookup = findSellerItemsBySku,
): Promise<GroupPublicationPlan> {
  const master = await loadMaster(storeId, listingId);
  const products = await prismadb.product.findMany({
    where: { storeId, productGroupId: master.group.id, isArchived: false },
    select: variantSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_GROUP_PUBLICATION_VARIANTS + 1,
  });
  const truncated = products.length > MAX_GROUP_PUBLICATION_VARIANTS;
  const variants = products.slice(0, MAX_GROUP_PUBLICATION_VARIANTS);
  const listings = await prismadb.marketplaceListing.findMany({
    where: { connectionId: master.connectionId, productId: { in: variants.map((variant) => variant.id) } },
    select: { id: true, productId: true, externalItemId: true, externalUserProductId: true },
  });
  const listingByProduct = new Map(listings.map((listing) => [listing.productId, listing]));
  const remote = await mapWithConcurrency(variants, (variant) => lookupRemote(lookup, master.connectionId, variant.sku));
  const metadata = getMercadoLibreListingMetadata(master.metadata);

  return {
    master: {
      listingId: master.id,
      productId: master.productId,
      familyName: metadata.familyName,
      categoryId: master.categoryId,
      listingType: master.listingType,
      marketplacePrice: master.marketplacePrice,
      stockSafetyBuffer: master.stockSafetyBuffer,
      attributes: metadata.attributes,
      saleConditions: metadata.saleConditions,
    },
    group: master.group,
    truncated,
    variants: variants.map((variant, index) => {
      const listing = listingByProduct.get(variant.id) ?? null;
      const remoteItems = remote[index];
      return {
        productId: variant.id,
        name: variant.name,
        sku: variant.sku,
        stock: variant.stock,
        price: variant.price,
        acqPrice: variant.acqPrice,
        transportationCost: variant.transportationCost,
        isKit: variant.isKit,
        brand: variant.brand,
        gtin: variant.gtin,
        mpn: variant.mpn,
        hasNoProductIdentifier: variant.hasNoProductIdentifier,
        colorName: variant.color?.name ?? null,
        sizeName: variant.size?.name ?? null,
        designName: variant.design?.name ?? null,
        imageUrls: variant.images.map((image) => image.url),
        isMaster: variant.id === master.productId,
        listingId: listing?.id ?? null,
        state: getGroupVariantState(
          {
            isArchived: variant.isArchived,
            stock: variant.stock,
            imageCount: variant.images.length,
            listing,
            remoteItems,
          },
          master.stockSafetyBuffer,
        ),
        remoteItems: remoteItems ?? [],
      };
    }),
  };
}

export type GroupDraftRequest = {
  productId: string;
  marketplacePrice: number;
  attributes: MercadoLibreAttribute[];
  imageUrls?: string[];
};

export type GroupDraftResult = {
  familyBatchId: string;
  created: { listingId: string; productId: string }[];
  skipped: { productId: string; reason: string }[];
};

function parseGroupDraftRequests(value: unknown): GroupDraftRequest[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_GROUP_PUBLICATION_VARIANTS) {
    throw ErrorFactory.InvalidRequest(`Elige entre 1 y ${MAX_GROUP_PUBLICATION_VARIANTS} variantes`);
  }
  const seen = new Set<string>();
  return value.map((entry) => {
    const input = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {};
    const productId = typeof input.productId === "string" ? input.productId.trim() : "";
    if (!productId || seen.has(productId)) throw ErrorFactory.InvalidRequest("Cada variante debe aparecer una sola vez");
    seen.add(productId);
    const marketplacePrice = Number(input.marketplacePrice);
    if (!Number.isFinite(marketplacePrice) || marketplacePrice <= 0) {
      throw ErrorFactory.InvalidRequest("Cada variante necesita un precio de Mercado Libre mayor que cero");
    }
    const attributes = (Array.isArray(input.attributes) ? input.attributes : []).flatMap((attribute) => {
      if (!attribute || typeof attribute !== "object") return [];
      const record = attribute as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim().toUpperCase() : "";
      const valueId = typeof record.value_id === "string" && record.value_id.trim() ? record.value_id.trim() : null;
      const valueName = typeof record.value_name === "string" && record.value_name.trim() ? record.value_name.trim() : null;
      if (!id || (!valueId && !valueName)) return [];
      return [{ id, ...(valueId ? { value_id: valueId } : {}), ...(valueName ? { value_name: valueName } : {}) }];
    });
    const imageUrls = Array.isArray(input.imageUrls)
      ? Array.from(new Set(input.imageUrls.flatMap((url) => (typeof url === "string" && url.trim() ? [url.trim()] : []))))
      : undefined;
    return { productId, marketplacePrice, attributes, imageUrls: imageUrls?.length ? imageUrls : undefined };
  });
}

/**
 * Crea un borrador por variante con la configuración del borrador base:
 * mismo nombre de familia (Mercado Libre las agrupa por él), categoría,
 * tipo, envío y ficha común; precio, fotos y atributos propios por
 * variante. No publica: la publicación es un paso aparte y explícito.
 */
export async function createGroupPublicationDrafts(
  storeId: string,
  listingId: string,
  rawVariants: unknown,
  lookup: RemoteSkuLookup = findSellerItemsBySku,
): Promise<GroupDraftResult> {
  const requests = parseGroupDraftRequests(rawVariants);
  const master = await loadMaster(storeId, listingId);
  if (master.connection.status !== MarketplaceConnectionStatus.CONNECTED) {
    throw ErrorFactory.InvalidRequest("Conecta una cuenta activa de Mercado Libre antes de crear publicaciones");
  }
  const masterMetadata = getMercadoLibreListingMetadata(master.metadata);
  if (!masterMetadata.familyName || !master.categoryId) {
    throw ErrorFactory.InvalidRequest("Completa el nombre de familia y la categoría del borrador base antes de extenderlo al grupo");
  }
  const rawMaster = (master.metadata && typeof master.metadata === "object" && !Array.isArray(master.metadata)
    ? master.metadata
    : {}) as Record<string, unknown>;
  const familyBatchId = typeof rawMaster.familyBatchId === "string" && rawMaster.familyBatchId ? rawMaster.familyBatchId : randomUUID();

  const products = await prismadb.product.findMany({
    where: { id: { in: requests.map((request) => request.productId) }, storeId, productGroupId: master.group.id },
    select: variantSelect,
  });
  const productById = new Map<string, VariantRow>(products.map((product) => [product.id, product]));
  const listings = await prismadb.marketplaceListing.findMany({
    where: { connectionId: master.connectionId, productId: { in: products.map((product) => product.id) } },
    select: { productId: true, externalItemId: true, externalUserProductId: true },
  });
  const listingByProduct = new Map(listings.map((listing) => [listing.productId, listing]));

  const created: GroupDraftResult["created"] = [];
  const skipped: GroupDraftResult["skipped"] = [];
  for (const request of requests) {
    const product = productById.get(request.productId);
    if (!product) {
      skipped.push({ productId: request.productId, reason: "No pertenece a este grupo." });
      continue;
    }
    const state = getGroupVariantState(
      {
        isArchived: product.isArchived,
        stock: product.stock,
        imageCount: product.images.length,
        listing: listingByProduct.get(product.id) ?? null,
        remoteItems: await lookupRemote(lookup, master.connectionId, product.sku),
      },
      master.stockSafetyBuffer,
    );
    if (state.kind !== "ready") {
      skipped.push({ productId: product.id, reason: describeGroupVariantState(state) });
      continue;
    }
    const priceGuard = evaluateListingPrice({ price: request.marketplacePrice, product, override: null });
    if (!priceGuard.ok) {
      skipped.push({ productId: product.id, reason: priceGuard.message });
      continue;
    }
    if (request.imageUrls) {
      const own = new Set(product.images.map((image) => image.url));
      if (request.imageUrls.some((url) => !own.has(url))) {
        skipped.push({ productId: product.id, reason: "Las fotos deben ser de esta variante." });
        continue;
      }
    }
    const attributes = request.attributes.filter((attribute) => !IDENTIFIER_ATTRIBUTE_IDS.has(attribute.id));
    const metadata = buildMercadoLibreListingMetadata({
      current: null,
      attributes,
      familyName: masterMetadata.familyName,
      imageUrls: request.imageUrls,
      saleConditions: masterMetadata.saleConditions,
    }) as Prisma.JsonObject;
    try {
      const listing = await prismadb.marketplaceListing.create({
        data: {
          connectionId: master.connectionId,
          productId: product.id,
          marketplacePrice: request.marketplacePrice,
          categoryId: master.categoryId,
          listingType: master.listingType,
          stockSafetyBuffer: master.stockSafetyBuffer,
          syncStock: master.syncStock,
          syncPrice: master.syncPrice,
          minimumMarginAmount: master.minimumMarginAmount,
          metadata: { ...metadata, familyBatchId, productGroupId: master.group.id },
        },
        select: { id: true },
      });
      created.push({ listingId: listing.id, productId: product.id });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skipped.push({ productId: product.id, reason: "Ya tiene una publicación o un borrador." });
        continue;
      }
      throw error;
    }
  }

  if (created.length && rawMaster.familyBatchId !== familyBatchId) {
    await prismadb.marketplaceListing.update({
      where: { id: master.id },
      data: { metadata: { ...rawMaster, familyBatchId, productGroupId: master.group.id } as Prisma.JsonObject },
    });
  }
  return { familyBatchId, created, skipped };
}
