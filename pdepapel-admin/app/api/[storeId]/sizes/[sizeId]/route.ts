import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; sizeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.sizeId) {
      throw ErrorFactory.InvalidRequest("El ID del tamaño es requerido");
    }

    const size = await prismadb.size.findUnique({
      where: { id: params.sizeId, storeId: params.storeId },
    });

    return NextResponse.json(size);
  } catch (error) {
    return handleErrorResponse(error, "SIZE_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; sizeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.sizeId) {
      throw ErrorFactory.InvalidRequest("El ID del tamaño es requerido");
    }

    const body = await req.json();
    const { name, value } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name) {
      throw ErrorFactory.InvalidRequest("El nombre del tamaño es requerido");
    }
    if (!value) {
      throw ErrorFactory.InvalidRequest("El valor del tamaño es requerido");
    }

    const existingSize = await prismadb.size.findUnique({
      where: {
        id: params.sizeId,
        storeId: params.storeId,
      },
    });

    if (!existingSize) {
      throw ErrorFactory.NotFound(
        `El tamaño ${params.sizeId} no existe en esta tienda`,
      );
    }

    const updatedSize = await prismadb.size.update({
      where: {
        id: params.sizeId,
      },
      data: {
        name: name.trim(),
        value: value.trim(),
      },
    });

    return NextResponse.json(updatedSize);
  } catch (error) {
    return handleErrorResponse(error, "SIZE_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; sizeId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.sizeId) {
      throw ErrorFactory.InvalidRequest("El ID del tamaño es requerido");
    }

    await verifyStoreOwner(userId, params.storeId);

    const deletedSize = await prismadb.$transaction(async (tx) => {
      const size = await tx.size.findUnique({
        where: {
          id: params.sizeId,
          storeId: params.storeId,
        },
        include: {
          products: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!size) {
        throw ErrorFactory.NotFound("Tamaño no encontrado");
      }

      if (size.products.length > 0) {
        throw ErrorFactory.Conflict(
          `No se puede eliminar el tamaño ${size.name} porque tiene ${size.products.length} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            size: size.name,
            products: size.products.length,
          },
        );
      }

      return await tx.size.delete({
        where: {
          id: params.sizeId,
        },
      });
    });

    return NextResponse.json(deletedSize);
  } catch (error) {
    return handleErrorResponse(error, "SIZE_DELETE");
  }
}
