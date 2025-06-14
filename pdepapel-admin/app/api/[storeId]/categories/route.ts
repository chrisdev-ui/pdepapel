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
export const runtime = "edge";

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
    const { name, typeId } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest("Se requiere un nombre de categoría");

    if (!typeId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un tipo para la categoría",
      );

    const category = await prismadb.category.create({
      data: { name, typeId, storeId: params.storeId },
      select: {
        id: true,
        name: true,
      },
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
        typeId: true,
      },
    });

    return NextResponse.json(categories, {
      headers: CACHE_HEADERS.SEMI_STATIC,
    });
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
        "Se requieren IDs de categorías en formato de arreglo",
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
          "Algunas categorías no se han encontrado en esta tienda",
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
          "No se pueden eliminar categorías con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails(
              "categoriesWithProducts",
              categoriesWithProducts,
            ),
          },
        );
      }

      await tx.category.deleteMany({
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
  } catch (error) {
    return handleErrorResponse(error, "CATEGORIES_DELETE");
  }
}
