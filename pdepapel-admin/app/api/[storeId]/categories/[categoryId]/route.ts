import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import {
  getUniqueCategorySlug,
  preserveCategorySlugAlias,
} from "@/lib/category-slugs";
import prismadb from "@/lib/prismadb";
import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { slugify } from "@/lib/slugify";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

const getCategoryRevalidationPaths = (...slugs: string[]) => [
  "/",
  "/tienda",
  "/sitemap.xml",
  ...slugs.filter(Boolean).map((slug) => `/categoria/${slug}`),
];

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de sub-categoría");

    let category = await prismadb.category.findFirst({
      where: {
        storeId: params.storeId,
        OR: [{ id: params.categoryId }, { slug: params.categoryId }],
      },
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
      },
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
          where: { id: alias.categoryId, storeId: params.storeId },
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
          },
        });
      }
    }

    if (!category) {
      throw ErrorFactory.NotFound("Sub-categoría no encontrada");
    }

    return NextResponse.json(category, {
      headers: CACHE_HEADERS.DYNAMIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de sub-categoría");

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
    } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un nombre de sub-categoría",
      );

    if (!typeId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un tipo para la sub-categoría",
      );

    let previousSlug = "";
    const updatedCategory = await prismadb.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      if (!category)
        throw ErrorFactory.NotFound(
          `La sub-categoría ${params.categoryId} no existe en esta tienda`,
        );

      const type = await tx.type.findUnique({
        where: { id: typeId },
      });

      if (!type)
        throw ErrorFactory.NotFound(
          `El tipo ${typeId} no existe en esta tienda`,
        );

      const slug = await getUniqueCategorySlug(tx, {
        storeId: params.storeId,
        baseSlug: slugify(name),
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
          name,
          slug,
          typeId,
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
          typeId: true,
          seoEnabled: true,
          seoFeatured: true,
          seoTitle: true,
          seoDescription: true,
          seoIntro: true,
          imageUrl: true,
        },
      });
    });

    await triggerStorefrontRevalidation({
      paths: getCategoryRevalidationPaths(updatedCategory.slug, previousSlug),
      tags: ["categories", "products"],
    });

    return NextResponse.json(updatedCategory, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de sub-categoría");

    await verifyStoreOwner(userId, params.storeId);

    const deletedCategory = await prismadb.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      if (!category)
        throw ErrorFactory.NotFound(
          `La sub-categoría ${params.categoryId} no existe en esta tienda`,
        );

      const products = await tx.product.count({
        where: {
          storeId: params.storeId,
          categoryId: params.categoryId,
        },
      });

      if (products > 0)
        throw ErrorFactory.Conflict(
          `No se puede eliminar la sub-categoría ${category.name} porque tiene ${products} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            category: category.name,
            products,
          },
        );

      await tx.categorySlugAlias.deleteMany({
        where: { categoryId: category.id },
      });

      await tx.category.delete({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      return category;
    });

    await triggerStorefrontRevalidation({
      paths: getCategoryRevalidationPaths(deletedCategory.slug),
      tags: ["categories", "products"],
    });

    return NextResponse.json("Sub-categoría eliminada correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_DELETE");
  }
}
