import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { splitTaxonomyIcon } from "@/lib/catalog-options";
import { getUniqueCategorySlug } from "@/lib/category-slugs";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { slugify } from "@/lib/slugify";
import {
  CACHE_HEADERS,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const getCategoryRevalidationPaths = (...slugs: string[]) => [
  "/",
  "/tienda",
  "/sitemap.xml",
  ...slugs.filter(Boolean).map((slug) => `/categoria/${slug}`),
];

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
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

    if (!name)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un nombre de sub-categoría",
      );

    if (!typeId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un tipo para la sub-categoría",
      );

    const type = await prismadb.type.findFirst({
      where: { id: typeId, storeId: params.storeId },
      select: { id: true },
    });
    if (!type) {
      throw ErrorFactory.NotFound("El tipo no existe en esta tienda");
    }

    const canonical = splitTaxonomyIcon(name);
    const slug = await getUniqueCategorySlug(prismadb, {
      storeId: params.storeId,
      baseSlug: slugify(canonical.name),
    });

    const category = await prismadb.category.create({
      data: {
        name: canonical.name,
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
      select: {
        id: true,
        name: true,
        slug: true,
        seoEnabled: true,
        seoFeatured: true,
        seoTitle: true,
        seoDescription: true,
        seoIntro: true,
        imageUrl: true,
        icon: true,
      },
    });

    await triggerStorefrontRevalidation({
      paths: getCategoryRevalidationPaths(category.slug),
      tags: ["categories", "products"],
    });

    return NextResponse.json(category, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const categories = await prismadb.category.findMany({
      where: { storeId: params.storeId },
      select: {
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
      },
    });

    return NextResponse.json(categories, { headers: CACHE_HEADERS.DYNAMIC });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_GET");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0)
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de sub-categorías en formato de arreglo",
      );

    await prismadb.$transaction(async (tx) => {
      const categories = await tx.category.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (categories.length !== ids.length)
        throw ErrorFactory.NotFound(
          "Algunas sub-categorías no se han encontrado en esta tienda",
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
          "No se pueden eliminar sub-categorías con productos asociados. Elimina o reasigna los productos asociados primero",
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
    });

    return NextResponse.json("Sub-categorías eliminadas correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_DELETE");
  }
}
