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

    const body = await req.json();
    const { name } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name?.trim()) {
      throw ErrorFactory.InvalidRequest("El nombre del proveedor es requerido");
    }

    const existingSupplier = await prismadb.supplier.findFirst({
      where: {
        storeId: params.storeId,
        name: {
          equals: name.trim(),
        },
      },
    });

    if (existingSupplier) {
      throw ErrorFactory.Conflict("Ya existe un proveedor con este nombre");
    }

    const supplier = await prismadb.supplier.create({
      data: {
        name: name.trim(),
        storeId: params.storeId,
      },
    });

    return NextResponse.json(supplier, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIERS_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function GET(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const suppliers = await prismadb.supplier.findMany({
      where: { storeId: params.storeId },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(suppliers, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIERS_GET", {
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
        "Los IDs de los proveedores son requeridos y deben ser un array",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const suppliers = await tx.supplier.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
        include: {
          products: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (suppliers.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunos proveedores no existen o no pertenecen a esta tienda",
        );
      }

      const suppliersWithProducts = suppliers.filter(
        (supplier) => supplier.products.length > 0,
      );

      if (suppliersWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar proveedores con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails(
              "suppliersWithProducts",
              suppliersWithProducts.map((supplier) => ({
                id: supplier.id,
                name: supplier.name,
                products: supplier.products.length,
              })),
            ),
          },
        );
      }

      await tx.supplier.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json("Los proveedores han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SUPPLIERS_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
