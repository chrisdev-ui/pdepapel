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

const PUBLIC_DESIGN_SELECT = { id: true, name: true } as const;

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

    if (!name) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("design", "nombre"));

    // Nombre único por tienda sin distinguir mayúsculas ni tildes; el índice
    // `Design_storeId_name_key` es la última barrera (P2002 → mismo 409).
    const existing = await prismadb.design.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true },
    });
    if (findDuplicateTaxonomyName(existing, name)) throw duplicateTaxonomyError("design", name);

    const design = await prismadb.design
      .create({
        data: { name, storeId: params.storeId },
        select: PUBLIC_DESIGN_SELECT,
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "design", name);
      });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(design, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGNS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Lista pública (tienda en línea): solo diseños activos y solo campos del catálogo. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const designs = await prismadb.design.findMany({
      where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
      select: PUBLIC_DESIGN_SELECT,
    });

    return NextResponse.json(designs, {
      headers: CACHE_HEADERS.SEMI_STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGNS_GET", { headers: CACHE_HEADERS.NO_CACHE });
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
        "Se requieren IDs de diseños válidos en formato de arreglo",
      );
    }

    await prismadb.$transaction(async (tx) => {
      const designs = await tx.design.findMany({
        where: { id: { in: ids }, storeId: params.storeId },
      });

      if (designs.length !== ids.length)
        throw ErrorFactory.NotFound(
          "Algunos diseños no existen en esta tienda",
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

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json("Los diseños han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "DESIGNS_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
