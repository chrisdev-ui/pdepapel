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

const PUBLIC_DESIGN_SELECT = { id: true, name: true } as const;

/** Lectura pública de un diseño de la tienda; otra tienda o un id ajeno → 404. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; designId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.designId)
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("design", "ID"));

    const design = await prismadb.design.findFirst({
      where: { id: params.designId, storeId: params.storeId },
      select: PUBLIC_DESIGN_SELECT,
    });

    if (!design) throw ErrorFactory.NotFound(missingTaxonomyMessage("design"));

    return NextResponse.json(design, {
      headers: CACHE_HEADERS.SEMI_STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGN_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; designId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.designId)
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("design", "ID"));

    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json();
    const name = cleanTaxonomyName(body?.name);

    if (!name) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("design", "nombre"));

    const design = await prismadb
      .$transaction(async (tx) => {
        const designs = await tx.design.findMany({
          where: { storeId: params.storeId },
          select: { id: true, name: true },
        });
        if (!designs.some((row) => row.id === params.designId)) {
          throw ErrorFactory.NotFound(missingTaxonomyMessage("design"));
        }
        if (findDuplicateTaxonomyName(designs, name, params.designId)) {
          throw duplicateTaxonomyError("design", name);
        }

        return tx.design.update({
          where: { id: params.designId, storeId: params.storeId },
          data: { name },
          select: PUBLIC_DESIGN_SELECT,
        });
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "design", name);
      });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(design, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGN_PATCH", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; designId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.designId)
      throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("design", "ID"));

    await verifyStoreOwner(userId, params.storeId);

    await prismadb.$transaction(async (tx) => {
      const design = await tx.design.findFirst({
        where: { id: params.designId, storeId: params.storeId },
      });

      if (!design) throw ErrorFactory.NotFound(missingTaxonomyMessage("design"));

      const products = await tx.product.count({
        where: {
          designId: params.designId,
          storeId: params.storeId,
        },
      });

      if (products > 0)
        throw ErrorFactory.Conflict(
          `No se puede eliminar el diseño ${design.name} porque tiene ${products} productos asociados. Elimina o reasigna los productos asociados primero`,
          {
            design: design.name,
            products,
          },
        );

      await tx.design.delete({
        where: { id: params.designId, storeId: params.storeId },
      });
    });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json("Diseño eliminado correctamente", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGN_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
