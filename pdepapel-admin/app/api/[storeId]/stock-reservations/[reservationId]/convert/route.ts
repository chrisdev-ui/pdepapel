import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { convertReservation } from "@/lib/stock-reservations";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/**
 * «Convertir en pedido». No cambia lo disponible (la reserva sigue
 * guardando las unidades), así que no hace falta purgar la tienda.
 */
export async function POST(_req: Request, { params }: { params: { storeId: string; reservationId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const result = await convertReservation(params.storeId, params.reservationId, userId);
    return NextResponse.json(result, { status: result.existing ? 200 : 201, headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATION_CONVERT", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404, 409] });
  }
}
