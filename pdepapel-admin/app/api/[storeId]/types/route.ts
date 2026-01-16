import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";

// Enable Edge Runtime for faster response times

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const body = await req.json();
    const { name } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest(
        "El nombre de la categoría es requerido",
      );
    }

    const existingType = await prismadb.type.findFirst({
      where: {
        storeId: params.storeId,
        name: name.trim(),
      },
    });

    if (existingType) {
      throw ErrorFactory.Conflict("Ya existe una categoría con este nombre");
    }

    const type = await prismadb.type.create({
      data: {
        name: name.trim(),
        storeId: params.storeId,
      },
    });

    return NextResponse.json(type, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const types = await prismadb.type.findMany({
      where: {
        storeId: params.storeId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(types, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "TYPES_GET", {
      headers: CACHE_HEADERS.STATIC,
    });
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

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Los IDs de las categorías son requeridos y deben ser un arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const types = await tx.type.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
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

      if (types.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunas categorías no existen o no pertenecen a esta tienda",
        );
      }

      const typesWithProducts = types.filter((type) =>
        type.categories.some((category) => category.products.length > 0),
      );

      if (typesWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar categorías que tienen sub-categorías con productos asociados",
          {
            types: typesWithProducts.map((type) => ({
              id: type.id,
              name: type.name,
              categoriesWithProducts: type.categories
                .filter((cat) => cat.products.length > 0)
                .map((cat) => ({
                  id: cat.id,
                  name: cat.name,
                  productsCount: cat.products.length,
                })),
            })),
          },
        );
      }

      await tx.category.deleteMany({
        where: {
          typeId: {
            in: ids,
          },
        },
      });

      await tx.type.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json("Categorías eliminadas correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error: any) {
    return handleErrorResponse(error, "TYPES_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
