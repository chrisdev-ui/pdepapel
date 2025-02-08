import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

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
    });

    return NextResponse.json(category);
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
      });
    });

    return NextResponse.json(updatedCategory);
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

    const deletedCategory = await prismadb.$transaction(async (tx) => {
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

      return await tx.category.delete({
        where: { id: params.categoryId, storeId: params.storeId },
      });
    });

    return NextResponse.json(deletedCategory);
  } catch (error) {
    return handleErrorResponse(error, "CATEGORY_DELETE");
  }
}
