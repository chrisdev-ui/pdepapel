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

const PUBLIC_COLOR_SELECT = { id: true, name: true, value: true } as const;

/** Lectura pública de un color de la tienda; otra tienda o un id ajeno → 404. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; colorId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.colorId)
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "ID"));

    const color = await prismadb.color.findFirst({
      where: { id: params.colorId, storeId: params.storeId },
      select: PUBLIC_COLOR_SELECT,
    });

    if (!color) throw ErrorFactory.NotFound(missingTaxonomyMessage("color"));

    return NextResponse.json(color, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "COLOR_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; colorId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.colorId)
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "ID"));

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const name = cleanTaxonomyName(body?.name);
    const value = typeof body?.value === "string" ? body.value.trim() : "";

    if (!name) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "nombre"));
    if (!value) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "valor"));

    const updatedColor = await prismadb
      .$transaction(async (tx) => {
        const colors = await tx.color.findMany({
          where: { storeId: params.storeId },
          select: { id: true, name: true },
        });
        if (!colors.some((color) => color.id === params.colorId)) {
          throw ErrorFactory.NotFound(missingTaxonomyMessage("color"));
        }
        if (findDuplicateTaxonomyName(colors, name, params.colorId)) {
          throw duplicateTaxonomyError("color", name);
        }

        return tx.color.update({
          where: { id: params.colorId, storeId: params.storeId },
          data: { name, value },
          select: PUBLIC_COLOR_SELECT,
        });
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "color", name);
      });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(updatedColor, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COLOR_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; colorId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.colorId)
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "ID"));

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const color = await tx.color.findFirst({
        where: {
          id: params.colorId,
          storeId: params.storeId,
        },
      });

      if (!color) throw ErrorFactory.NotFound(missingTaxonomyMessage("color"));

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

      await tx.color.delete({
        where: {
          id: params.colorId,
          storeId: params.storeId,
        },
      });
    });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json("El color ha sido eliminado", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COLOR_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
