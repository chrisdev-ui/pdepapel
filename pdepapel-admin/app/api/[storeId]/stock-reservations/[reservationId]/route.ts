import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { withIdempotency } from "@/lib/idempotency";
import {
  addReservationItem,
  editReservationCustomer,
  extendReservation,
  getReservationDetail,
  releaseReservation,
  setReservationItemQuantity,
} from "@/lib/stock-reservations";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

type Params = { params: { storeId: string; reservationId: string } };

/** Una reserva con sus productos y su historial. Solo la dueña: lleva los datos de la clienta. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const detail = await getReservationDetail(params.storeId, params.reservationId);
    return NextResponse.json(detail, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATION_GET", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [404] });
  }
}

/**
 * Acciones sobre una reserva: «liberar», «extender», «add_item»,
 * «set_quantity» (0 quita el producto) y «edit_customer». Con
 * `Idempotency-Key`, un doble toque en el teléfono no aparta dos veces.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return await withIdempotency(req, params.storeId, async () => {
      const body = await req.json().catch(() => null);
      const action = body && typeof body === "object" ? body.action : null;
      const { storeId, reservationId } = params;

      if (action === "liberar") {
        const result = await releaseReservation(storeId, reservationId, userId);
        if (result.changed) await invalidateStoreProductsCache(storeId, { productIds: result.affectedProductIds });
        return NextResponse.json({ released: result.changed }, { headers: CACHE_HEADERS.NO_CACHE });
      }
      if (action === "extender") {
        const reservation = await extendReservation(storeId, reservationId, body.days, userId);
        return NextResponse.json({ reservation }, { headers: CACHE_HEADERS.NO_CACHE });
      }
      if (action === "add_item" || action === "set_quantity") {
        const result =
          action === "add_item"
            ? await addReservationItem(storeId, reservationId, { productId: body.productId, quantity: body.quantity }, userId)
            : await setReservationItemQuantity(storeId, reservationId, { itemId: body.itemId, quantity: body.quantity }, userId);
        await invalidateStoreProductsCache(storeId, { productIds: result.affectedProductIds });
        return NextResponse.json({ reservation: result.reservation, released: result.released }, { headers: CACHE_HEADERS.NO_CACHE });
      }
      if (action === "edit_customer") {
        const reservation = await editReservationCustomer(storeId, reservationId, { customerName: body.customerName, customerPhone: body.customerPhone, note: body.note }, userId);
        return NextResponse.json({ reservation }, { headers: CACHE_HEADERS.NO_CACHE });
      }
      throw ErrorFactory.InvalidRequest("Acción no válida: usa «liberar», «extender», «add_item», «set_quantity» o «edit_customer»");
    }, CACHE_HEADERS.NO_CACHE);
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATION_PATCH", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
