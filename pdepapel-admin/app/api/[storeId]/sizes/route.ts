import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { ACTIVE_ATTRIBUTE_WHERE } from "@/lib/attribute-archive";
import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import {
  cleanTaxonomyName,
  duplicateTaxonomyError,
  findDuplicateTaxonomyName,
  mapTaxonomyUniqueError,
  requiredTaxonomyFieldMessage,
} from "@/lib/taxonomy";
import {
  CACHE_HEADERS,
  parseErrorDetails,
  verifyStoreOwner,
} from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const name = cleanTaxonomyName(body?.name);
    const value = typeof body?.value === "string" ? body.value.trim() : "";

    if (!name) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "nombre"));
    if (!value) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("size", "valor"));

    // El valor es único por índice (`Size_storeId_value_key`); el nombre se
    // compara sin distinguir mayúsculas ni tildes.
    const sizes = await prismadb.size.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true, value: true },
    });
    if (sizes.some((size) => size.value === value)) {
      throw ErrorFactory.Conflict(
        `Ya existe un tamaño con el valor «${value}» en esta tienda.`,
      );
    }
    if (findDuplicateTaxonomyName(sizes, name)) throw duplicateTaxonomyError("size", name);

    const size = await prismadb.size
      .create({
        data: {
          name,
          value,
          storeId: params.storeId,
        },
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "size", name);
      });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(size, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZES_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

/** Lista pública (tienda en línea): solo tamaños activos. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const sizes = await prismadb.size.findMany({
      where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(sizes, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZES_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const { ids }: { ids: string[] } = await req.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw ErrorFactory.InvalidRequest(
        "Se requieren IDs de tamaños en formato de arreglo",
      );
    }

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
        throw ErrorFactory.NotFound(
          "Algunos tamaños no existen en esta tienda",
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

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json("Los tamaños han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "SIZES_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  }
}
