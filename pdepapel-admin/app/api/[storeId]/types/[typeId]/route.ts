import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, parseErrorDetails } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
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
      throw ErrorFactory.InvalidRequest("El ID del tipo es requerido");
    }

    const type = await prismadb.type.findUnique({
      where: { id: params.typeId, storeId: params.storeId },
    });

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
      throw ErrorFactory.InvalidRequest("El ID del tipo es requerido");
    }

    const body = await req.json();
    const { name } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest("El nombre del tipo es requerido");
    }

    const existingType = await prismadb.type.findUnique({
      where: {
        id: params.typeId,
        storeId: params.storeId,
      },
    });

    if (!existingType) {
      throw ErrorFactory.NotFound(
        "Tipo no encontrado o no pertenece a esta tienda",
      );
    }

    const duplicateType = await prismadb.type.findFirst({
      where: {
        storeId: params.storeId,
        name: name.trim(),
        NOT: {
          id: params.typeId,
        },
      },
    });

    if (duplicateType) {
      throw ErrorFactory.Conflict("Ya existe un tipo con este nombre");
    }

    const updatedType = await prismadb.type.update({
      where: {
        id: params.typeId,
      },
      data: {
        name: name.trim(),
      },
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
      throw ErrorFactory.InvalidRequest("El ID del tipo es requerido");
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
          "Tipo no encontrado o no pertenece a esta tienda",
        );
      }

      const categoriesWithProducts = type.categories.filter(
        (category) => category.products.length > 0,
      );

      if (categoriesWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se puede eliminar un tipo que tiene productos asociados a sus categorías",
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

    return NextResponse.json("Tipo eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
