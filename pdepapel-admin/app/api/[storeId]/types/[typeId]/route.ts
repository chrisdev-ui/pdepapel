import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { splitTaxonomyIcon } from "@/lib/catalog-options";
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

// Enable Edge Runtime for faster response times

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; typeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.typeId) {
      throw ErrorFactory.InvalidRequest("El ID de la categoría es requerido");
    }

    let type = await prismadb.type.findFirst({
      where: {
        storeId: params.storeId,
        OR: [{ id: params.typeId }, { slug: params.typeId }],
      },
    });

    if (!type) {
      const alias = await prismadb.typeSlugAlias.findUnique({
        where: {
          storeId_slug: {
            storeId: params.storeId,
            slug: params.typeId,
          },
        },
        select: { typeId: true },
      });

      if (alias) {
        type = await prismadb.type.findFirst({
          where: { id: alias.typeId, storeId: params.storeId },
        });
      }
    }

    if (!type) throw ErrorFactory.NotFound("Categoría no encontrada");

    return NextResponse.json(type, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPE_GET", {
      headers: CACHE_HEADERS.STATIC,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; typeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.typeId) {
      throw ErrorFactory.InvalidRequest("El ID de la categoría es requerido");
    }

    const body = await req.json();
    const { name, icon } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest(
        "El nombre de la categoría es requerido",
      );
    }

    const existingType = await prismadb.type.findUnique({
      where: {
        id: params.typeId,
        storeId: params.storeId,
      },
    });

    if (!existingType) {
      throw ErrorFactory.Conflict(
        "Categoría no encontrada o no pertenece a esta tienda",
      );
    }

    const canonical = splitTaxonomyIcon(name.trim());
    const duplicateType = await prismadb.type.findFirst({
      where: {
        storeId: params.storeId,
        name: canonical.name,
        NOT: {
          id: params.typeId,
        },
      },
    });

    if (duplicateType) {
      throw ErrorFactory.Conflict("Ya existe una categoría con este nombre");
    }

    const updatedType = await prismadb.$transaction(async (tx) => {
      const slug = slugify(canonical.name);
      if (existingType.slug && existingType.slug !== slug) {
        const existingAlias = await tx.typeSlugAlias.findUnique({
          where: {
            storeId_slug: {
              storeId: params.storeId,
              slug: existingType.slug,
            },
          },
        });
        if (!existingAlias) {
          await tx.typeSlugAlias.create({
            data: {
              storeId: params.storeId,
              typeId: existingType.id,
              slug: existingType.slug,
            },
          });
        }
      }

      return tx.type.update({
        where: { id: params.typeId },
        data: {
          name: canonical.name,
          slug,
          icon: icon?.trim() || canonical.icon || existingType.icon,
        },
      });
    });

    await triggerStorefrontRevalidation({
      paths: ["/", "/tienda"],
      tags: ["categories", "products"],
    });

    return NextResponse.json(updatedType, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPE_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; typeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.typeId) {
      throw ErrorFactory.InvalidRequest("El ID de la categoría es requerido");
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const type = await tx.type.findUnique({
        where: {
          id: params.typeId,
          storeId: params.storeId,
        },
        include: {
          categories: {
            include: {
              products: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!type) {
        throw ErrorFactory.NotFound(
          "Categoría no encontrada o no pertenece a esta tienda",
        );
      }

      const categoriesWithProducts = type.categories.filter(
        (category) => category.products.length > 0,
      );

      if (categoriesWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se puede eliminar una categoría que tiene sub-categorías con productos asociados",
          {
            ...parseErrorDetails(
              "categoriesWithProducts",
              categoriesWithProducts.map((category) => ({
                id: category.id,
                name: category.name,
                productsCount: category.products.length,
              })),
            ),
          },
        );
      }

      const categoryIds = type.categories.map((category) => category.id);
      await tx.categoryCatalogOption.deleteMany({
        where: { categoryId: { in: categoryIds } },
      });
      await tx.categorySlugAlias.deleteMany({
        where: { categoryId: { in: categoryIds } },
      });
      await tx.typeSlugAlias.deleteMany({
        where: { typeId: params.typeId },
      });

      await tx.category.deleteMany({
        where: {
          typeId: params.typeId,
        },
      });

      await tx.type.delete({
        where: {
          id: params.typeId,
        },
      });
    });

    await triggerStorefrontRevalidation({
      paths: ["/", "/tienda", "/sitemap.xml"],
      tags: ["categories", "products"],
    });

    return NextResponse.json("Categoría eliminada correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
