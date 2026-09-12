import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { splitTaxonomyIcon } from "@/lib/catalog-options";
import { getCategoryRevalidationPaths, getUniqueCategorySlug } from "@/lib/category-slugs";
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
import {
  CACHE_HEADERS,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
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

/**
 * Crea una subcategoría. Responde en cuanto existe la fila: la portada y la
 * intro con IA se piden aparte desde `[categoryId]/cover` (auditoría Grupo B:
 * antes el POST esperaba a OpenAI y bloqueaba el formulario).
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

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

    const type = await prismadb.type.findFirst({
      where: { id: typeId, storeId: params.storeId },
      select: { id: true },
    });
    if (!type) throw ErrorFactory.NotFound(missingTaxonomyMessage("type"));

    const canonical = splitTaxonomyIcon(name);
    const canonicalName = cleanTaxonomyName(canonical.name);
    if (!canonicalName) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("category", "nombre"));

    // Nombre único dentro de la misma categoría, sin distinguir mayúsculas ni tildes.
    const siblings = await prismadb.category.findMany({
      where: { storeId: params.storeId, typeId },
      select: { id: true, name: true },
    });
    if (findDuplicateTaxonomyName(siblings, canonicalName)) {
      throw duplicateTaxonomyError("category", canonicalName, "type");
    }

    const slug = await getUniqueCategorySlug(prismadb, {
      storeId: params.storeId,
      baseSlug: slugify(canonicalName),
    });

    const category = await prismadb.category
      .create({
        data: {
          name: canonicalName,
          icon: icon?.trim() || canonical.icon,
          slug,
          typeId,
          storeId: params.storeId,
          seoEnabled: Boolean(seoEnabled),
          seoFeatured: Boolean(seoEnabled && seoFeatured),
          seoTitle: seoTitle?.trim() || null,
          seoDescription: seoDescription?.trim() || null,
          seoIntro: seoIntro?.trim() || null,
          imageUrl: imageUrl?.trim() || null,
        },
        select: PUBLIC_CATEGORY_SELECT,
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "category", canonicalName, "type");
      });

    await Promise.all([
      triggerStorefrontRevalidation({
        paths: getCategoryRevalidationPaths(category.slug),
        tags: ["categories", "products"],
      }),
      invalidateStoreProductsCache(params.storeId),
    ]);

    return NextResponse.json(category, {
      status: 201,
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Lista pública (tienda en línea): solo subcategorías activas y solo campos del catálogo. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const categories = await prismadb.category.findMany({
      where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
      select: PUBLIC_CATEGORY_SELECT,
    });

    return NextResponse.json(categories, { headers: CACHE_HEADERS.DYNAMIC });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0)
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de subcategorías en formato de arreglo",
      );

    const slugs = await prismadb.$transaction(async (tx) => {
      const categories = await tx.category.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
        select: { id: true, slug: true },
      });

      if (categories.length !== ids.length)
        throw ErrorFactory.NotFound(
          "Algunas subcategorías no existen en esta tienda",
        );

      const categoriesWithProducts = await tx.category.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
          products: {
            some: {},
          },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (categoriesWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar subcategorías con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails(
              "categoriesWithProducts",
              categoriesWithProducts,
            ),
          },
        );
      }

      await tx.categoryCatalogOption.deleteMany({
        where: { categoryId: { in: ids } },
      });
      await tx.categorySlugAlias.deleteMany({
        where: { categoryId: { in: ids } },
      });

      await tx.category.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      return categories.map((category) => category.slug);
    });

    await Promise.all([
      triggerStorefrontRevalidation({
        paths: getCategoryRevalidationPaths(...slugs),
        tags: ["categories", "products"],
      }),
      invalidateStoreProductsCache(params.storeId),
    ]);

    return NextResponse.json("Subcategorías eliminadas correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
