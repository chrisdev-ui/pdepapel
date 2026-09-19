import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { undoPointOfSaleSale } from "@/lib/point-of-sale";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * Deshace una venta del punto de venta (solo dueño): dentro de los 30 minutos
 * siguientes al pago, el pedido queda cancelado y el inventario vuelve con un
 * movimiento por producto. Después de la ventana responde 409.
 */
export async function POST(_req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    if (!params.orderId) throw ErrorFactory.InvalidRequest("Se requiere el ID de la venta");

    await verifyStoreOwner(userId, params.storeId);

    const result = await undoPointOfSaleSale({ storeId: params.storeId, orderId: params.orderId, userId });
    if (result.restocked) await invalidateStoreProductsCache(params.storeId);

    return NextResponse.json(
      {
        message: result.restocked
          ? `Venta ${result.order.orderNumber} deshecha: el inventario volvió.`
          : `Cobro en datáfono cancelado; la venta ${result.order.orderNumber} no descontó inventario.`,
        order: { id: result.order.id, orderNumber: result.order.orderNumber, status: result.order.status },
        restocked: result.restocked,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "POINT_OF_SALE_UNDO_POST", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
