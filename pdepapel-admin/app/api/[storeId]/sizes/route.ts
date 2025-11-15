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

    const body = await req.json();
    const { name, value } = body;

    await verifyStoreOwner(userId, params.storeId);

    if (!name) {
      throw ErrorFactory.InvalidRequest("El nombre del tamaño es requerido");
    }
    if (!value) {
      throw ErrorFactory.InvalidRequest("El valor del tamaño es requerido");
    }

    // Check if size with same value already exists in this store
    const existingSize = await prismadb.size.findFirst({
      where: {
        storeId: params.storeId,
        value: value.trim(),
      },
    });

    if (existingSize) {
      throw ErrorFactory.Conflict(
        `Ya existe un tamaño con el valor "${value.trim()}" en esta tienda`,
      );
    }

    const size = await prismadb.size.create({
      data: {
        name: name.trim(),
        value: value.trim(),
        storeId: params.storeId,
      },
    });

    return NextResponse.json(size, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZES_POST", {
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

    const sizes = await prismadb.size.findMany({
      where: { storeId: params.storeId },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(sizes, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZES_GET", {
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
        "Los IDs de los tamaños son requeridos y deben estar en formato de arreglo",
      );
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const sizes = await tx.size.findMany({
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

      if (sizes.length !== ids.length) {
        throw ErrorFactory.InvalidRequest(
          "Algunos tamaños no existen o no pertenecen a esta tienda",
        );
      }

      const sizesWithProducts = sizes.filter(
        (size) => size.products.length > 0,
      );
      if (sizesWithProducts.length > 0) {
        throw ErrorFactory.Conflict(
          "No se pueden eliminar tamaños con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails(
              "sizes",
              sizesWithProducts.map((size) => ({
                id: size.id,
                name: size.name,
                productsCount: size.products.length,
              })),
            ),
          },
        );
      }

      await tx.size.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    return NextResponse.json("Los tamaños han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZES_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
