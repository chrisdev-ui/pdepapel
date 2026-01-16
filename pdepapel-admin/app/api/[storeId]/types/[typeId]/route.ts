import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
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
      throw ErrorFactory.InvalidRequest("El ID de la categoría es requerido");
    }

    const body = await req.json();
    const { name } = body;

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
      throw ErrorFactory.NotFound(
        "Categoría no encontrada o no pertenece a esta tienda",
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
      throw ErrorFactory.Conflict("Ya existe una categoría con este nombre");
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

    return NextResponse.json("Categoría eliminada correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
