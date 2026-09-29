import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { CACHE_HEADERS, verifyStoreOwner } from "@/lib/utils";

/** Un valor de tarjeta: activar, desactivar, reordenar o quitar (solo la dueña). */
export async function PATCH(
  req: Request,
  { params }: { params: { storeId: string; denominationId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await req.json().catch(() => null);
    const data: { isActive?: boolean; sortOrder?: number } = {};
    if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
    if (Number.isInteger(body?.sortOrder)) data.sortOrder = body.sortOrder;
    if (Object.keys(data).length === 0) {
      throw ErrorFactory.InvalidRequest("Nada que cambiar");
    }
    const updated = await prismadb.giftCardDenomination.updateMany({
      where: { id: params.denominationId, storeId: params.storeId },
      data,
    });
    if (updated.count === 0) throw ErrorFactory.NotFound("Ese valor no existe");
    const row = await prismadb.giftCardDenomination.findUnique({ where: { id: params.denominationId } });
    return NextResponse.json(row, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_DENOMINATION_PATCH", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { storeId: string; denominationId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const deleted = await prismadb.giftCardDenomination.deleteMany({
      where: { id: params.denominationId, storeId: params.storeId },
    });
    if (deleted.count === 0) throw ErrorFactory.NotFound("Ese valor no existe");
    return NextResponse.json({ ok: true }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_DENOMINATION_DELETE", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
