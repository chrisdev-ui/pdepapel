import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { withIdempotency } from "@/lib/idempotency";
import { createReservation, findOpenReservationsByPhone, isReservationFilter, listReservations } from "@/lib/stock-reservations";
import { CACHE_HEADERS } from "@/lib/utils";
import { verifyStoreOwner } from "@/lib/server/utils";
import { requireJsonBody } from "@/lib/request-body";

/** Apartados de la tienda. Solo la dueña: llevan el nombre y el celular de la clienta. */
export async function GET(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    const search = new URL(req.url).searchParams;
    // `?telefono=`: las reservas abiertas de esa clienta, para «Agregar a la reserva abierta».
    if (search.has("telefono")) {
      const reservations = await findOpenReservationsByPhone(params.storeId, search.get("telefono"));
      return NextResponse.json({ reservations }, { headers: CACHE_HEADERS.NO_CACHE });
    }
    const filter = search.get("filtro");
    const reservations = await listReservations(params.storeId, isReservationFilter(filter) ? filter : "activas");
    return NextResponse.json({ reservations }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATIONS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}

export async function POST(req: Request, { params }: { params: { storeId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);
    return await withIdempotency(req, params.storeId, async () => {
      const body = await requireJsonBody(req, "STOCK_RESERVATIONS_POST");
      if (!body || typeof body !== "object") throw ErrorFactory.InvalidRequest("Datos de la reserva inválidos");
      const { reservation, affectedProductIds } = await createReservation({
        storeId: params.storeId,
        items: body.items,
        productId: body.productId,
        quantity: body.quantity,
        customerName: body.customerName,
        customerPhone: body.customerPhone,
        note: body.note,
        days: body.days,
        createdBy: userId,
      });
      await invalidateStoreProductsCache(params.storeId, { productIds: affectedProductIds });
      return NextResponse.json({ reservation }, { status: 201, headers: CACHE_HEADERS.NO_CACHE });
    }, CACHE_HEADERS.NO_CACHE);
  } catch (error) {
    return handleErrorResponse(error, "STOCK_RESERVATIONS_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 409] });
  }
}
