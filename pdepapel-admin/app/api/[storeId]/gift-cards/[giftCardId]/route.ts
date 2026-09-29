import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

import { GIFT_CARD_ADMIN_SELECT } from "@/lib/gift-card-admin-select";

/** Una tarjeta con su libro y los pedidos donde se usó. */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string; giftCardId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await requireStoreRead(params.storeId);
    const card = await prismadb.giftCard.findFirst({
      where: { id: params.giftCardId, storeId: params.storeId },
      select: {
        ...GIFT_CARD_ADMIN_SELECT,
        movements: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            amount: true,
            balanceAfter: true,
            reason: true,
            orderId: true,
            createdBy: true,
            createdAt: true,
          },
        },
        redemptions: {
          select: { id: true, orderNumber: true, status: true, total: true, giftCardAmount: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!card) throw ErrorFactory.NotFound("La tarjeta de regalo no existe");
    return NextResponse.json(card, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARD_GET", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [404],
    });
  }
}
