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

const PUBLIC_COLOR_SELECT = { id: true, name: true, value: true } as const;

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

    if (!name) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "nombre"));
    if (!value) throw ErrorFactory.InvalidRequest(requiredTaxonomyFieldMessage("color", "valor"));

    // Nombre único por tienda sin distinguir mayúsculas ni tildes; el índice
    // `Color_storeId_name_key` es la última barrera (P2002 → mismo 409).
    const existing = await prismadb.color.findMany({
      where: { storeId: params.storeId },
      select: { id: true, name: true },
    });
    if (findDuplicateTaxonomyName(existing, name)) throw duplicateTaxonomyError("color", name);

    const color = await prismadb.color
      .create({
        data: { name, value, storeId: params.storeId },
        select: PUBLIC_COLOR_SELECT,
      })
      .catch((error) => {
        throw mapTaxonomyUniqueError(error, "color", name);
      });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(color, {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COLORS_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

/** Lista pública (tienda en línea): solo colores activos y solo campos del catálogo. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    const colors = await prismadb.color.findMany({
      where: { storeId: params.storeId, ...ACTIVE_ATTRIBUTE_WHERE },
      select: PUBLIC_COLOR_SELECT,
    });

    return NextResponse.json(colors, {
      headers: CACHE_HEADERS.STATIC,
    });
  } catch (error) {
    return handleErrorResponse(error, "COLORS_GET", { headers: CACHE_HEADERS.NO_CACHE });
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
        "Se requieren IDs de colores en formato de arreglo",
      );
    }

    await prismadb.$transaction(async (tx) => {
      const colors = await tx.color.findMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });

      if (colors.length !== ids.length)
        throw ErrorFactory.NotFound(
          "Algunos colores no existen en esta tienda",
        );

      const colorsInUse = await tx.color.findMany({
        where: {
          storeId: params.storeId,
          id: { in: ids },
          products: { some: {} },
        },
        select: {
          id: true,
          name: true,
        },
      });

      if (colorsInUse.length > 0)
        throw ErrorFactory.Conflict(
          "No se pueden eliminar colores con productos asociados. Elimina o reasigna los productos asociados primero",
          {
            ...parseErrorDetails("colorsInUse", colorsInUse),
          },
        );

      await tx.color.deleteMany({
        where: {
          storeId: params.storeId,
          id: {
            in: ids,
          },
        },
      });
    });

    await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json("Los colores han sido eliminados", {
      headers: CACHE_HEADERS.NO_CACHE,
    });
  } catch (error) {
    return handleErrorResponse(error, "COLORS_DELETE", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
