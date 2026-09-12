import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { splitTaxonomyIcon } from "@/lib/catalog-options";
import {
  getCategoryRevalidationPaths,
  getUniqueCategorySlug,
  preserveCategorySlugAlias,
} from "@/lib/category-slugs";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { slugify } from "@/lib/slugify";
import {
  cleanTaxonomyName,
  duplicateTaxonomyError,
  findDuplicateTaxonomyName,
  mapTaxonomyUniqueError,
  missingTaxonomyMessage,
  requiredTaxonomyFieldMessage,
} from "@/lib/taxonomy";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const PUBLIC_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  typeId: true,
  seoEnabled: true,
  seoFeatured: true,
  seoTitle: true,
  seoDescription: true,
  seoIntro: true,
  imageUrl: true,
  icon: true,
} as const;

const MISSING_ID = "Se requiere el ID de la subcategoría.";

/**
 * Lectura pública por id, slug o alias de slug; solo subcategorías activas de
 * la tienda indicada.
 */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId) throw ErrorFactory.InvalidRequest(MISSING_ID);

    let category = await prismadb.category.findFirst({
      where: {
        storeId: params.storeId,
        ...ACTIVE_ATTRIBUTE_WHERE,
        OR: [{ id: params.categoryId }, { slug: params.categoryId }],
      },
      select: PUBLIC_CATEGORY_SELECT,
    });

    if (!category) {
      const alias = await prismadb.categorySlugAlias.findUnique({
        where: {
          storeId_slug: {
            storeId: params.storeId,
            slug: params.categoryId,
          },
        },
        select: { categoryId: true },
      });

      if (alias) {
        category = await prismadb.category.findFirst({
          where: { id: alias.categoryId, storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
          select: PUBLIC_CATEGORY_SELECT,
        });
      }
    }

    if (!category) throw ErrorFactory.NotFound(missingTaxonomyMessage("category"));

    return NextResponse.json(category, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId) throw ErrorFactory.InvalidRequest(MISSING_ID);

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const {
      name,
      typeId,
      seoEnabled = false,
      seoFeatured = false,
      seoTitle,
      seoDescription,
      seoIntro,
      imageUrl,
      icon,
    } = body;

    if (!name || typeof name !== "string" || !cleanTaxonomyName(name))
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("category", "nombre"));

    if (!typeId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere una categoría para la subcategoría.",
      );

    const canonical = splitTaxonomyIcon(name);
    const canonicalName = cleanTaxonomyName(canonical.name);
    if (!canonicalName) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("category", "nombre"));

    let previousSlug = "";
    const updatedCategory = await prismadb
      .$transaction(async (tx) => {
        const category = await tx.category.findFirst({
          where: { id: params.categoryId, storeId: params.storeId },
        });

        if (!category) throw ErrorFactory.NotFound(missingTaxonomyMessage("category"));

        const type = await tx.type.findFirst({
          where: { id: typeId, storeId: params.storeId },
          select: { id: true },
        });

        if (!type) throw ErrorFactory.NotFound(missingTaxonomyMessage("type"));

        // Nombre único dentro de la categoría destino, sin distinguir mayúsculas ni tildes.
        const siblings = await tx.category.findMany({
          where: { storeId: params.storeId, typeId },
          select: { id: true, name: true },
        });
        if (findDuplicateTaxonomyName(siblings, canonicalName, category.id)) {
          throw duplicateTaxonomyError("category", canonicalName, "type");
        }

        const slug = await getUniqueCategorySlug(tx, {
          storeId: params.storeId,
          baseSlug: slugify(canonicalName),
          excludeCategoryId: category.id,
        });

        previousSlug = category.slug;
        if (category.slug !== slug) {
          await preserveCategorySlugAlias(tx, {
            storeId: params.storeId,
            categoryId: category.id,
            slug: category.slug,
          });
        }

        return tx.category.update({
          where: { id: params.categoryId, storeId: params.storeId },
          data: {
            name: canonicalName,
            icon: icon?.trim() || canonical.icon || category.icon,
            slug,
            typeId,
            seoEnabled: Boolean(seoEnabled),
            seoFeatured: Boolean(seoEnabled && seoFeatured),
            seoTitle: seoTitle?.trim() || null,
            seoDescription: seoDescription?.trim() || null,
            seoIntro: seoIntro?.trim() || null,
            imageUrl: imageUrl?.trim() || null,
          },
          select: PUBLIC_CATEGORY_SELECT,
        });
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "category", canonicalName, "type");
      });

    await Promise.all([
      triggerStorefrontRevalidation({
        paths: getCategoryRevalidationPaths(updatedCategory.slug, previousSlug),
        tags: ["categories", "products"],
      }),
      invalidateStoreProductsCache(params.storeId),
    ]);

    return NextResponse.json(updatedCategory, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId) throw ErrorFactory.InvalidRequest(MISSING_ID);

    await verifyStoreOwner(userId, params.storeId);

    const deletedCategory = await prismadb.$transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      if (!category) throw ErrorFactory.NotFound(missingTaxonomyMessage("category"));

      const products = await tx.product.count({
        where: {
          storeId: params.storeId,
          categoryId: params.categoryId,
        },
      });

      if (products > 0)
        throw ErrorFactory.Conflict(
          `No se puede eliminar la subcategoría ${category.name} porque tiene ${products} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            category: category.name,
            products,
          },
        );

      await tx.categorySlugAlias.deleteMany({
        where: { categoryId: category.id },
      });
      await tx.categoryCatalogOption.deleteMany({
        where: { categoryId: category.id },
      });

      await tx.category.delete({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      return category;
    });

    await Promise.all([
      triggerStorefrontRevalidation({
        paths: getCategoryRevalidationPaths(deletedCategory.slug),
        tags: ["categories", "products"],
      }),
      invalidateStoreProductsCache(params.storeId),
    ]);

    return NextResponse.json("Subcategoría eliminada correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
