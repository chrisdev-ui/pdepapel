import { auth } from "@clerk/nextjs";
import { z } from "zod";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  applyCatalogMigrationSuggestions,
  catalogMigrationPayloadSchema,
  mergeVisualCatalogAttributes,
  prepareCatalogMigrationSuggestions,
  updateCatalogMigrationAttributes,
  visualCatalogAttributesSchema,
} from "@/lib/catalog-migration";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { NextResponse } from "next/server";

const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("PREPARE"), limit: z.number().int().min(1).max(100).optional() }),
  z.object({
    action: z.literal("MERGE_AI"),
    suggestionId: z.string().uuid(),
    attributes: visualCatalogAttributesSchema,
  }),
  z.object({
    action: z.literal("UPDATE_ATTRIBUTES"),
    suggestionId: z.string().uuid(),
    attributes: catalogMigrationPayloadSchema.shape.attributes,
  }),
  z.object({
    action: z.literal("APPLY"),
    suggestionIds: z.array(z.string().uuid()).min(1).max(100),
  }),
]);

async function requireOwner(storeId: string) {
  const { userId } = auth();
  if (!userId) throw ErrorFactory.Unauthenticated();
  if (!storeId) throw ErrorFactory.MissingStoreId();
  await verifyStoreOwner(userId, storeId);
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);

    const [suggestions, statusCounts, activeProducts, assignedProducts] =
      await Promise.all([
        prismadb.catalogMigrationSuggestion.findMany({
          where: { storeId: params.storeId },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
          take: 100,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                images: { orderBy: { createdAt: "asc" }, take: 3 },
                category: { select: { name: true } },
              },
            },
          },
        }),
        prismadb.catalogMigrationSuggestion.groupBy({
          by: ["status"],
          where: { storeId: params.storeId },
          _count: { status: true },
        }),
        prismadb.product.count({
          where: { storeId: params.storeId, isArchived: false },
        }),
        prismadb.product.count({
          where: {
            storeId: params.storeId,
            isArchived: false,
            shippingProfileId: { not: null },
          },
        }),
      ]);

    return NextResponse.json(
      {
        summary: {
          activeProducts,
          assignedProducts,
          pendingProducts: Math.max(0, activeProducts - assignedProducts),
          statuses: Object.fromEntries(
            statusCounts.map((item) => [item.status, item._count.status]),
          ),
        },
        suggestions: suggestions.map((suggestion) => ({
          ...suggestion,
          payload: catalogMigrationPayloadSchema.parse(suggestion.payload),
        })),
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "CATALOG_MIGRATION_GET");
  }
}

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    await requireOwner(params.storeId);
    const mutation = mutationSchema.parse(await req.json());

    if (mutation.action === "PREPARE") {
      const result = await prepareCatalogMigrationSuggestions({
        storeId: params.storeId,
        limit: mutation.limit,
      });
      return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
    }

    if (mutation.action === "MERGE_AI") {
      const suggestion = await mergeVisualCatalogAttributes({
        storeId: params.storeId,
        suggestionId: mutation.suggestionId,
        attributes: mutation.attributes,
      });
      if (!suggestion) throw ErrorFactory.NotFound("Propuesta no encontrada");
      return NextResponse.json(suggestion, { headers: CACHE_HEADERS.NO_CACHE });
    }

    if (mutation.action === "UPDATE_ATTRIBUTES") {
      const suggestion = await updateCatalogMigrationAttributes({
        storeId: params.storeId,
        suggestionId: mutation.suggestionId,
        attributes: mutation.attributes,
      });
      if (!suggestion) throw ErrorFactory.NotFound("Propuesta no encontrada");
      return NextResponse.json(suggestion, { headers: CACHE_HEADERS.NO_CACHE });
    }

    const result = await applyCatalogMigrationSuggestions({
      storeId: params.storeId,
      suggestionIds: mutation.suggestionIds,
    });
    await triggerStorefrontRevalidation({
      paths: ["/", "/tienda", "/sitemap.xml"],
      tags: ["categories", "products", "catalog-options"],
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "CATALOG_MIGRATION_POST");
  }
}
