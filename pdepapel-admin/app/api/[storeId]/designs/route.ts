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
    const { name } = body;

    if (!name)
      throw ErrorFactory.InvalidRequest("El nombre del diseño es obligatorio");

    const design = await prismadb.design.create({
      data: { name, storeId: params.storeId },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json(design, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGNS_POST");
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const designs = await prismadb.design.findMany({
      where: { storeId: params.storeId },
      select: {
        id: true,
        name: true,
      },
    });

    return NextResponse.json(designs, {
      headers: CACHE_HEADERS.SEMI_STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGNS_GET");
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
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de diseños válidos en formato de arreglo",
      );
    }

    await prismadb.$transaction(async (tx) => {
      const designs = await tx.design.findMany({
        where: { id: { in: ids }, storeId: params.storeId },
      });

      if (designs.length !== ids.length)
        throw ErrorFactory.InvalidRequest(
          "Algunos IDs de diseños no se encuentran en la tienda",
        );

      const designsInUse = await tx.design.findMany({
        where: {
          storeId: params.storeId,
          id: { in: ids },
          products: { some: {} },
        },
        select: { id: true, name: true },
      });

      if (designsInUse.length > 0)
        throw ErrorFactory.Conflict(
          "No se pueden eliminar diseños con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails("designsInUse", designsInUse),
          },
        );

      await tx.design.deleteMany({
        where: {
          storeId: params.storeId,
          id: { in: ids },
        },
      });
    });

    return NextResponse.json("Los diseños han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGNS_DELETE");
  }
}
