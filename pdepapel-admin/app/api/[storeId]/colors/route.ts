import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { parseErrorDetails, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

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
    const { name, value } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest("El nombre del color es obligatorio");
    if (!value)
      throw ErrorFactory.InvalidRequest("El valor del color es obligatorio");

    const color = await prismadb.color.create({
      data: { name, value, storeId: params.storeId },
    });

    return NextResponse.json(color);
  } catch (error) {
    return handleErrorResponse(error, "COLORS_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const colors = await prismadb.color.findMany({
      where: { storeId: params.storeId },
    });

    return NextResponse.json(colors);
  } catch (error) {
    return handleErrorResponse(error, "COLORS_GET");
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();

    await verifyStoreOwner(userId, params.storeId);

    const { ids }: { ids: string[] } = await req.json();
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de colores en formato de arreglo",
      );
    }

    const deletedColors = await prismadb.$transaction(async (tx) => {
      const colors = await tx.color.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (colors.length !== ids.length)
        throw ErrorFactory.InvalidRequest(
          "Algunos IDs de colores no se encuentran en la tienda",
        );

      const colorsInUse = await tx.color.findMany({
        where: {
          storeId: params.storeId,
          id: { in: ids },
          products: { some: {} },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (colorsInUse.length > 0)
        throw ErrorFactory.Conflict(
          "No se pueden eliminar colores con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails("colorsInUse", colorsInUse),
          },
        );

      return await tx.color.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json(deletedColors);
  } catch (error) {
    return handleErrorResponse(error, "COLORS_DELETE");
  }
}
