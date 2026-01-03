import { handleErrorResponse } from "@/lib/api-error-response";
import { ErrorFactory } from "@/lib/api-errors";;
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/db-utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

// Enable Edge Runtime for faster response times

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; categoryId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.categoryId)
      throw ErrorFactory.InvalidRequest("Se requiere un ID de categoría");

    const category = await prismadb.category.findUnique({
      where: { id: params.categoryId, storeId: params.storeId },
      select: {
        id: true,
        name: true,
        typeId: true,
      },
    });

    return NextResponse.json(category, {
      headers: CACHE_HEADERS.SEMI_STATIC,
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
      throw ErrorFactory.InvalidRequest("Se requiere un ID de categoría");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { name, typeId } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest("Se requiere un nombre de categoría");

    if (!typeId)
      throw ErrorFactory.InvalidRequest(
        "Se requiere un tipo para la categoría",
      );

    const updatedCategory = await prismadb.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      if (!category)
        throw ErrorFactory.NotFound(
          `La categoría ${params.categoryId} no existe en esta tienda`,
        );

      const type = await tx.type.findUnique({
        where: { id: typeId },
      });

      if (!type)
        throw ErrorFactory.NotFound(
          `El tipo ${typeId} no existe en esta tienda`,
        );

      return tx.category.update({
        where: { id: params.categoryId, storeId: params.storeId },
        data: {
          name,
          typeId,
        },
        select: {
          id: true,
          name: true,
          typeId: true,
        },
      });
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
      throw ErrorFactory.InvalidRequest("Se requiere un ID de categoría");

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: params.categoryId, storeId: params.storeId },
      });

      if (!category)
        throw ErrorFactory.NotFound(
          `La categoría ${params.categoryId} no existe en esta tienda`,
        );

      const products = await tx.product.count({
        where: {
          storeId: params.storeId,
          categoryId: params.categoryId,
        },
      });

      if (products > 0)
        throw ErrorFactory.Conflict(
          `No se puede eliminar la categoría ${category.name} porque tiene ${products} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            category: category.name,
            products,
          },
        );

      await tx.category.delete({
        where: { id: params.categoryId, storeId: params.storeId },
      });
    });

    return NextResponse.json("Categoría eliminada correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_DELETE");
  }
}
