import { Prisma, type PrismaClient } from "@prisma/client";

import prismadb from "@/lib/prismadb";

import {
  addCategoryUse,
  learnedProfileAttributes,
  parseCategoryCandidates,
} from "./category-profiles";
import { getMercadoLibreJson } from "./client";
import { getMercadoLibreListingMetadata } from "./listing-metadata";

type Db = Pick<PrismaClient, "marketplacePublicationProfile">;

export type CategoryUse = {
  storeId: string;
  localCategoryId: string;
  localCategoryName: string;
  categoryId: string;
  categoryName: string | null;
  attributes: Prisma.JsonValue;
  stockSafetyBuffer: number;
  at?: Date;
};

/**
 * Anota que esta subcategoría se publicó con esta categoría de Mercado
 * Libre. Sin perfil, crea uno aprendido y «sugerido». Con perfil, suma la
 * categoría a sus opciones; solo cambia la categoría principal de un perfil
 * aprendido que nadie ha aceptado todavía, nunca la elección de Paula.
 */
export async function recordCategoryUse(use: CategoryUse, { db = prismadb as Db }: { db?: Db } = {}) {
  const at = (use.at ?? new Date()).toISOString();
  const where = { storeId_localCategoryId: { storeId: use.storeId, localCategoryId: use.localCategoryId } };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const existing = await db.marketplacePublicationProfile.findUnique({
      where,
      select: { id: true, origin: true, state: true, candidates: true },
    });
    if (!existing) {
      try {
        return await db.marketplacePublicationProfile.create({
          data: {
            storeId: use.storeId,
            localCategoryId: use.localCategoryId,
            name: use.localCategoryName.slice(0, 120),
            categoryId: use.categoryId,
            attributes: learnedProfileAttributes(getMercadoLibreListingMetadata(use.attributes).attributes) as Prisma.InputJsonValue,
            stockSafetyBuffer: use.stockSafetyBuffer,
            origin: "LEARNED",
            state: "SUGGESTED",
            candidates: addCategoryUse([], { categoryId: use.categoryId, categoryName: use.categoryName, at }) as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        throw error;
      }
    }
    const candidates = addCategoryUse(parseCategoryCandidates(existing.candidates), {
      categoryId: use.categoryId,
      categoryName: use.categoryName,
      at,
    });
    const stillLearning = existing.origin === "LEARNED" && existing.state === "SUGGESTED";
    return db.marketplacePublicationProfile.update({
      where: { id: existing.id },
      data: {
        candidates: candidates as Prisma.InputJsonValue,
        ...(stillLearning ? { categoryId: candidates[0].categoryId } : {}),
      },
    });
  }
  return null;
}

async function readCategoryName(connectionId: string, categoryId: string) {
  try {
    const payload = (await getMercadoLibreJson(connectionId, `/categories/${encodeURIComponent(categoryId)}`)) as { name?: unknown };
    return typeof payload?.name === "string" ? payload.name : null;
  } catch {
    return null;
  }
}

/**
 * Después de una publicación nueva: aprende la categoría de su subcategoría.
 * Nunca hace fallar la publicación.
 */
export async function learnFromPublishedListing(listingId: string) {
  try {
    const listing = await prismadb.marketplaceListing.findUnique({
      where: { id: listingId },
      select: {
        connectionId: true,
        categoryId: true,
        stockSafetyBuffer: true,
        metadata: true,
        connection: { select: { storeId: true } },
        product: { select: { category: { select: { id: true, name: true } } } },
      },
    });
    if (!listing?.categoryId || !listing.product.category) return null;
    return await recordCategoryUse({
      storeId: listing.connection.storeId,
      localCategoryId: listing.product.category.id,
      localCategoryName: listing.product.category.name,
      categoryId: listing.categoryId,
      categoryName: await readCategoryName(listing.connectionId, listing.categoryId),
      attributes: listing.metadata,
      stockSafetyBuffer: listing.stockSafetyBuffer,
    });
  } catch (error) {
    console.warn("[MERCADOLIBRE_CATEGORY_LEARNING] No se pudo aprender la categoría:", error);
    return null;
  }
}

export { readCategoryName };
