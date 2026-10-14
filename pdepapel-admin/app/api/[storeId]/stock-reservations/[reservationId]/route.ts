import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { extendReservation, releaseReservation } from "@/lib/stock-reservations";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type Params = { params: { storeId: string; reservationId: string } };

/** «Liberar» o «+ días» sobre una reserva. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const body = await req.json().catch(() => null);
    const action = body && typeof body === "object" ? body.action : null;

    if (action === "liberar") {
      const result = await releaseReservation(params.storeId, params.reservationId, userId);
      if (result.changed) await invalidateStoreProductsCache(params.storeId, { productIds: result.affectedProductIds });
      return NextResponse.json({ released: result.changed }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    if (action === "extender") {
      const reservation = await extendReservation(params.storeId, params.reservationId, body.days);
      return NextResponse.json({ reservation }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    throw ErrorFactory.InvalidRequest("Acción no válida: usa «liberar» o «extender»");
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATION_PATCH", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
