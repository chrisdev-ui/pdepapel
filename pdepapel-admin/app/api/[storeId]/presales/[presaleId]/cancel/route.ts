import { auth } from "@clerk/nextjs/server";
import { OrderStatus, ProductPresaleStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * «Cancelar preventa»: la campaña deja de vender. Solo si no queda ningún
 * pedido pagado o con anticipo esperando esta mercancía: esos se cancelan
 * uno por uno desde el pedido (ahí se decide devolver o retener y el cupo y
 * el inventario vuelven bien). El dinero se devuelve a mano, como siempre.
 */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string; presaleId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const presale = await prismadb.productPresale.findFirst({
      where: { id: params.presaleId, storeId: params.storeId },
      select: { id: true, productId: true, status: true },
    });
    if (!presale) throw ErrorFactory.NotFound("La preventa no existe en esta tienda");
    if (presale.status !== ProductPresaleStatus.ACTIVE) {
      throw ErrorFactory.InvalidRequest("Esta preventa ya no está activa");
    }

    const waiting = await prismadb.order.count({
      where: {
        storeId: params.storeId,
        status: { in: [OrderStatus.PAID, OrderStatus.DEPOSIT_PAID] },
        orderItems: { some: { presaleId: presale.id, isPreorder: true, preorderReleasedAt: null } },
      },
    });
    if (waiting > 0) {
      throw ErrorFactory.Conflict(
        `Hay ${waiting} ${waiting === 1 ? "pedido que espera" : "pedidos que esperan"} esta mercancía. Cancélalos primero desde cada pedido (ahí eliges devolver o retener el anticipo).`,
        { waiting },
      );
    }

    const claim = await prismadb.productPresale.updateMany({
      where: { id: presale.id, status: ProductPresaleStatus.ACTIVE },
      data: { status: ProductPresaleStatus.CANCELLED },
    });
    if (claim.count === 0) throw ErrorFactory.Conflict("La preventa cambió mientras tanto. Recarga la página.");
    await invalidateStoreProductsCache(params.storeId, { productIds: [presale.productId] });

    return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "PRESALE_CANCEL", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
