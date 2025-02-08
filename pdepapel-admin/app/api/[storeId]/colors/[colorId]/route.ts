import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; colorId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.colorId)
      throw ErrorFactory.InvalidRequest("El ID del color es obligatorio");

    const color = await prismadb.color.findUnique({
      where: { id: params.colorId },
    });

    return NextResponse.json(color);
  } catch (error) {
    return handleErrorResponse(error, "COLOR_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; colorId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.colorId)
      throw ErrorFactory.InvalidRequest("El ID del color es obligatorio");

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const { name, value } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest("El nombre del color es obligatorio");
    if (!value)
      throw ErrorFactory.InvalidRequest("El valor del color es obligatorio");

    const updatedColor = await prismadb.$transaction(async (tx) => {
      const color = await tx.color.findUnique({
        where: { id: params.colorId, storeId: params.storeId },
      });

      if (!color)
        throw ErrorFactory.InvalidRequest(
          `El color ${params.colorId} no existe en la tienda`,
        );

      return tx.color.update({
        where: { id: params.colorId, storeId: params.storeId },
        data: {
          name,
          value,
        },
      });
    });

    return NextResponse.json(updatedColor);
  } catch (error) {
    return handleErrorResponse(error, "COLOR_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; colorId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.colorId)
      throw ErrorFactory.InvalidRequest("El ID del color es obligatorio");

    await verifyStoreOwner(userId, params.storeId);

    const deletedColor = await prismadb.$transaction(async (tx) => {
      const color = await tx.color.findUnique({
        where: {
          id: params.colorId,
          storeId: params.storeId,
        },
      });

      if (!color)
        throw ErrorFactory.NotFound(
          `El color ${params.colorId} no se encuentra en la tienda`,
        );

      const products = await tx.product.count({
        where: {
          storeId: params.storeId,
          colorId: params.colorId,
        },
      });

      if (products > 0)
        throw ErrorFactory.Conflict(
          `No se puede eliminar el color ${color.name} porque tiene ${products} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            color: color.name,
            products,
          },
        );

      return await tx.color.delete({
        where: {
          id: params.colorId,
          storeId: params.storeId,
        },
      });
    });

    return NextResponse.json(deletedColor);
  } catch (error) {
    return handleErrorResponse(error, "COLOR_DELETE");
  }
}
