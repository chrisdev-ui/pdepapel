import { auth } from "@clerk/nextjs/server";
import { ProductPresaleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireJsonBody } from "@/lib/request-body";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { parsePresaleUpdate } from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * Editar una preventa activa: fecha (o «por confirmar»), tope, anticipo y
 * condiciones. Los pedidos ya hechos no cambian: el anticipo y la versión de
 * las condiciones quedaron copiados en cada pedido. Solo la dueña.
 */
export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const input = parsePresaleUpdate(await requireJsonBody(req, "PRESALE_PATCH"));
    const presale = await prismadb.productPresale.findFirst({
      where: { id: params.presaleId, storeId: params.storeId },
      select: { id: true, productId: true, status: true, committedUnits: true },
    });
    if (!presale) throw ErrorFactory.NotFound("La preventa no existe en esta tienda");
    if (presale.status !== ProductPresaleStatus.ACTIVE) {
      throw ErrorFactory.InvalidRequest("Solo se edita una preventa activa");
    }
    if (input.unitLimit !== null && input.unitLimit < presale.committedUnits) {
      throw ErrorFactory.InvalidRequest(
        `Ya hay ${presale.committedUnits} unidades reservadas: el tope no puede quedar por debajo.`,
      );
    }

    const updated = await prismadb.productPresale.update({
      where: { id: presale.id },
      data: input,
    });
    await invalidateStoreProductsCache(params.storeId, { productIds: [presale.productId] });

    return NextResponse.json(updated, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404],
    });
  }
}
