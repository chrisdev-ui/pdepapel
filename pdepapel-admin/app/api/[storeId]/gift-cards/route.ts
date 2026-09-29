import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import prismadb from "@/lib/prismadb";
import { requireStoreRead } from "@/lib/store-access";
import { CACHE_HEADERS } from "@/lib/utils";

/** Selección de una tarjeta para el panel: nunca el hash del código. */
export const GIFT_CARD_ADMIN_SELECT = {
  id: true,
  codeLast4: true,
  initialAmount: true,
  balance: true,
  status: true,
  purchaseOrderId: true,
  buyerEmail: true,
  recipientName: true,
  recipientEmail: true,
  message: true,
  issuedAt: true,
  deliveredAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  purchaseOrder: {
    select: { id: true, orderNumber: true, fullName: true, status: true, paidAt: true },
  },
} as const;

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
