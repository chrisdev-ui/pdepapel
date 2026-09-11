import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";
import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * «Recalcular vigencias ahora»: apaga los cupones vencidos o agotados que
 * sigan encendidos. Nunca enciende ninguno: un cupón apagado a mano se queda
 * apagado, y uno programado se vuelve vigente solo por sus fechas.
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

    const now = new Date();
    const result = await prismadb.coupon.updateMany({
      where: {
        storeId: params.storeId,
        isActive: true,
        OR: [
          { endDate: { lt: now } },
          { AND: [{ maxUses: { not: null } }, { usedCount: { gte: prismadb.coupon.fields.maxUses } }] },
        ],
      },
      data: { isActive: false },
    });

    return NextResponse.json(
      {
        deactivated: result.count,
        message:
          result.count === 0
            ? "Todos los cupones ya estaban al día"
            : `Se ${result.count === 1 ? "apagó 1 cupón" : `apagaron ${result.count} cupones`} por vencimiento o agotamiento`,
      },
      { headers: CACHE_HEADERS.NO_CACHE },
    );
  } catch (error) {
    return handleErrorResponse(error, "COUPONS_UPDATE_VALIDITY");
  }
}
