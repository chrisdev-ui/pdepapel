import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { GIFT_CARD_ADMIN_SELECT } from "@/lib/gift-card-admin-select";
import { requireStoreRead } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

/** Lista de tarjetas (dueña y cuentas de solo lectura). */
export async function GET(
  _req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await requireStoreRead(params.storeId);
    const cards = await prismadb.giftCard.findMany({
      where: { storeId: params.storeId },
      select: GIFT_CARD_ADMIN_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ cards }, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "GIFT_CARDS_GET", { headers: CACHE_HEADERS.NO_CACHE });
  }
}
