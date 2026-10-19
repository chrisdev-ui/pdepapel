import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";
import { GROUP_VARIANT_COMBINATION_SELECT } from "@/lib/variant-combinations";

/**
 * La combinación (tamaño, color, diseño) y la subcategoría de cada variante de
 * un grupo. La ficha de producto la pide al elegir un grupo, en vez de
 * cargar las variantes de todos los grupos de la tienda.
 */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; productGroupId: string } },
) {
  try {
    await requireStoreRead(params.storeId);
    const group = await prismadb.productGroup.findFirst({
      where: { id: params.productGroupId, storeId: params.storeId },
      select: { id: true },
    });
    if (!group) throw ErrorFactory.NotFound("Grupo de productos no encontrado");
    const products = await prismadb.product.findMany({
      where: { storeId: params.storeId, productGroupId: group.id },
      select: GROUP_VARIANT_COMBINATION_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(products, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleErrorResponse(error, "PRODUCT_GROUP_COMBINATIONS_GET");
  }
}
