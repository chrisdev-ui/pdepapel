import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextRequest, NextResponse } from "next/server";

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
      throw ErrorFactory.InvalidRequest("El nombre del tipo es requerido");
    }

    const existingType = await prismadb.type.findFirst({
      where: {
        storeId: params.storeId,
        name: name.trim(),
      },
    });

    if (existingType) {
      throw ErrorFactory.Conflict("Ya existe un tipo con este nombre");
    }

    const type = await prismadb.type.create({
      data: {
        name: name.trim(),
        storeId: params.storeId,
      },
    });

    return NextResponse.json(type);
  } catch (error) {
    return handleErrorResponse(error, "TYPES_POST");
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

    return NextResponse.json(types);
  } catch (error) {
    return handleErrorResponse(error, "TYPES_GET");
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
        "Los IDs de los tipos son requeridos y deben ser un arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.$transaction(async (tx) => {
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
          "Algunos tipos no existen o no pertenecen a esta tienda",
        );
      }

      const typesWithProducts = types.filter((type) =>
        type.categories.some((category) => category.products.length > 0),
      );

      if (typesWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar tipos que tienen productos asociados a sus categorías",
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

      return await tx.type.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return handleErrorResponse(error, "TYPES_DELETE");
  }
}
