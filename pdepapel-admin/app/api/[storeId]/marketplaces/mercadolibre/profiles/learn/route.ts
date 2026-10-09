import { auth } from "@clerk/nextjs/server";
import { MarketplaceProvider } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { readCategoryName, recordCategoryUse } from "@/lib/mercadolibre/category-learning";
import { groupListingsForBackfill } from "@/lib/mercadolibre/category-profiles";
import { getMercadoLibreListingMetadata } from "@/lib/mercadolibre/listing-metadata";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Siembra perfiles sugeridos desde lo ya publicado (#22). GET solo muestra la
 * lista; POST la escribe con el mismo camino que aprende al publicar.
 */
async function loadBackfill(storeId: string) {
  const { userId } = await auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  await verifyStoreOwner(userId, storeId);
  const connection = await prismadb.marketplaceConnection.findUnique({
    where: { storeId_provider: { storeId, provider: MarketplaceProvider.MERCADOLIBRE } },
    select: { id: true },
  });
  if (!connection) throw ErrorFactory.NotFound("Primero conecta la cuenta de Mercado Libre");
  const listings = await prismadb.marketplaceListing.findMany({
    where: { connectionId: connection.id, externalItemId: { not: null }, categoryId: { not: null } },
    select: {
      categoryId: true,
      stockSafetyBuffer: true,
      metadata: true,
      product: { select: { category: { select: { id: true, name: true } } } },
    },
  });
  const profiles = await prismadb.marketplacePublicationProfile.findMany({
    where: { storeId },
    select: { localCategoryId: true },
  });
  const rows = listings.flatMap((listing) =>
    listing.product.category && listing.categoryId
      ? [
          {
            localCategoryId: listing.product.category.id,
            localCategoryName: listing.product.category.name,
            categoryId: listing.categoryId,
            attributes: getMercadoLibreListingMetadata(listing.metadata).attributes,
            stockSafetyBuffer: listing.stockSafetyBuffer,
            metadata: listing.metadata,
          },
        ]
      : [],
  );
  const groups = groupListingsForBackfill(rows, new Set(profiles.map((profile) => profile.localCategoryId)));
  const names = new Map<string, string | null>();
  for (const categoryId of Array.from(new Set(groups.flatMap((group) => group.categoryIds)))) {
    names.set(categoryId, await readCategoryName(connection.id, categoryId));
  }
  return { rows, groups, names };
}

export async function GET(_request: Request, { params }: { params: { storeId: string } }) {
  try {
    const { groups, names } = await loadBackfill(params.storeId);
    return NextResponse.json(
      groups.map((group) => ({
        ...group,
        categories: group.categoryIds.map((categoryId) => ({ categoryId, categoryName: names.get(categoryId) ?? null })),
      })),
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_PROFILES_LEARN_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Escribe solo las subcategorías aprobadas en la lista (`localCategoryIds`). */
export async function POST(request: Request, { params }: { params: { storeId: string } }) {
  try {
    const body = (await request.json().catch(() => ({}))) as { localCategoryIds?: unknown };
    const approved = new Set(
      Array.isArray(body.localCategoryIds) ? body.localCategoryIds.filter((id): id is string => typeof id === "string") : [],
    );
    if (approved.size === 0) throw ErrorFactory.InvalidRequest("Elige las subcategorías aprobadas de la lista");
    const { rows, groups, names } = await loadBackfill(params.storeId);
    const eligible = new Set(
      groups.filter((group) => group.skipped === null && approved.has(group.localCategoryId)).map((group) => group.localCategoryId),
    );
    let uses = 0;
    for (const row of rows) {
      if (!eligible.has(row.localCategoryId)) continue;
      await recordCategoryUse({
        storeId: params.storeId,
        localCategoryId: row.localCategoryId,
        localCategoryName: row.localCategoryName,
        categoryId: row.categoryId,
        categoryName: names.get(row.categoryId) ?? null,
        attributes: row.metadata,
        stockSafetyBuffer: row.stockSafetyBuffer,
      });
      uses += 1;
    }
    return NextResponse.json({ profiles: eligible.size, uses }, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "MERCADOLIBRE_PROFILES_LEARN_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
