import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import {
  cleanTaxonomyName,
  duplicateTaxonomyError,
  findDuplicateTaxonomyName,
  mapTaxonomyUniqueError,
  missingTaxonomyMessage,
  requiredTaxonomyFieldMessage,
} from "@/lib/taxonomy";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/** Lectura pública de un tamaño de la tienda; otra tienda o un id ajeno → 404. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; sizeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.sizeId) {
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "ID"));
    }

    const size = await prismadb.size.findFirst({
      where: { id: params.sizeId, storeId: params.storeId },
    });

    if (!size) throw ErrorFactory.NotFound(missingTaxonomyMessage("size"));

    return NextResponse.json(size, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZE_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; sizeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.sizeId) {
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "ID"));
    }

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const name = cleanTaxonomyName(body?.name);
    const value = typeof body?.value === "string" ? body.value.trim() : "";

    if (!name) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "nombre"));
    if (!value) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "valor"));

    const updatedSize = await prismadb
      .$transaction(async (tx) => {
        const sizes = await tx.size.findMany({
          where: { storeId: params.storeId },
          select: { id: true, name: true, value: true },
        });
        if (!sizes.some((size) => size.id === params.sizeId)) {
          throw ErrorFactory.NotFound(missingTaxonomyMessage("size"));
        }
        if (sizes.some((size) => size.id !== params.sizeId && size.value === value)) {
          throw ErrorFactory.Conflict(
            `Ya existe otro tamaño con el valor «${value}» en esta tienda.`,
          );
        }
        if (findDuplicateTaxonomyName(sizes, name, params.sizeId)) {
          throw duplicateTaxonomyError("size", name);
        }

        return tx.size.update({
          where: { id: params.sizeId, storeId: params.storeId },
          data: { name, value },
        });
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "size", name);
      });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(updatedSize, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZE_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; sizeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.sizeId) {
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "ID"));
    }

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const size = await tx.size.findFirst({
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

      if (!size) throw ErrorFactory.NotFound(missingTaxonomyMessage("size"));

      if (size.products.length > 0) {
        throw ErrorFactory.Conflict(
          `No se puede eliminar el tamaño ${size.name} porque tiene ${size.products.length} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            size: size.name,
            products: size.products.length,
          },
        );
      }

      await tx.size.delete({
        where: { id: params.sizeId, storeId: params.storeId },
      });
    });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json("Tamaño eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZE_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
