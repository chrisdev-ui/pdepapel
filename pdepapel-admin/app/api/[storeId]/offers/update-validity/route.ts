import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStorePromotionsCache } from "@/lib/cache";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * «Recalcular vigencias ahora»: apaga las ofertas vencidas que sigan
 * encendidas y refresca la tienda. Nunca enciende ninguna: una oferta apagada
 * a mano se queda apagada, y una programada entra en vigencia sola por fechas.
 */
export async function POST(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();

    await verifyStoreOwner(userId, params.storeId);

    const result = await prismadb.offer.updateMany({
      where: { storeId: params.storeId, isActive: true, endDate: { lt: new Date() } },
      data: { isActive: false },
    });

    await invalidateStorePromotionsCache(params.storeId);

    return NextResponse.json(
      {
        deactivated: result.count,
        message:
          result.count === 0
            ? "Todas las ofertas ya estaban al día; la tienda se refrescó"
            : `Se ${result.count === 1 ? "apagó 1 oferta vencida" : `apagaron ${result.count} ofertas vencidas`} y la tienda se refrescó`,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "OFFERS_UPDATE_VALIDITY");
  }
}
