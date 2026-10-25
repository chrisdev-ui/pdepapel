import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { convertReservation, previewConversion } from "@/lib/stock-reservations";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";

/** El resumen del pedido que se crearía (líneas al precio de hoy y total), sin crear nada. */
export async function GET(_req: Request, { params }: { params: { storeId: string; reservationId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const preview = await previewConversion(params.storeId, params.reservationId);
    return NextResponse.json(preview, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATION_CONVERT_PREVIEW", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404, 409] });
  }
}

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
