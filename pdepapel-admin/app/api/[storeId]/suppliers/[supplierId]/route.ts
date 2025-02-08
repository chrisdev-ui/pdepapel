import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.supplierId) {
      throw ErrorFactory.InvalidRequest("El ID del proveedor es requerido");
    }

    const supplier = await prismadb.supplier.findUnique({
      where: { id: params.supplierId, storeId: params.storeId },
    });

    return NextResponse.json(supplier);
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIER_GET");
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.supplierId) {
      throw ErrorFactory.InvalidRequest("El ID del proveedor es requerido");
    }

    const body = await req.json();
    const { name } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest("El nombre del proveedor es requerido");
    }

    // Verify supplier exists and belongs to store
    const existingSupplier = await prismadb.supplier.findUnique({
      where: {
        id: params.supplierId,
        storeId: params.storeId,
      },
    });

    if (!existingSupplier) {
      throw ErrorFactory.NotFound("El proveedor no existe en esta tienda");
    }

    const duplicateSupplier = await prismadb.supplier.findFirst({
      where: {
        storeId: params.storeId,
        name: name.trim(),
        NOT: {
          id: params.supplierId,
        },
      },
    });

    if (duplicateSupplier) {
      throw ErrorFactory.Conflict("Ya existe un proveedor con este nombre");
    }

    const updatedSupplier = await prismadb.supplier.update({
      where: {
        id: params.supplierId,
      },
      data: {
        name: name.trim(),
      },
    });

    return NextResponse.json(updatedSupplier);
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIER_PATCH");
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; supplierId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.supplierId) {
      throw ErrorFactory.InvalidRequest("El ID del proveedor es requerido");
    }

    await verifyStoreOwner(userId, params.storeId);

    const deletedSupplier = await prismadb.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: {
          id: params.supplierId,
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

      if (!supplier) {
        throw ErrorFactory.NotFound("Proveedor no encontrado");
      }

      if (supplier.products.length > 0) {
        throw ErrorFactory.Conflict(
          `No se puede eliminar el proveedor ${supplier.name} porque tiene ${supplier.products.length} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            supplier: supplier.name,
            products: supplier.products.length,
          },
        );
      }

      return await tx.supplier.delete({
        where: {
          id: params.supplierId,
        },
      });
    });

    return NextResponse.json(deletedSupplier);
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIER_DELETE");
  }
}
