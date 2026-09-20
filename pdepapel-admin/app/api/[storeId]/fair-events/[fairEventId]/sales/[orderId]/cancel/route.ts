import { NextResponse } from "next/server";

import { handleErrorResponse } from "@/lib/api-errors";
import { cancelFairSale } from "@/lib/fair-events";
import { requireStoreOwner } from "@/lib/store-access";

/**
 * Anula una venta de feria. Es la única vía: el PATCH/DELETE genérico de
 * pedidos rechaza las ventas de feria porque su restock devolvería al kardex
 * unidades que la feria nunca descontó.
 */
export async function POST(
  _req: Request,
  {
    params,
  }: { params: { storeId: string; fairEventId: string; orderId: string } },
) {
  try {
    const userId = await requireStoreOwner(params.storeId);

    return NextResponse.json(
      await cancelFairSale({
        storeId: params.storeId,
        fairEventId: params.fairEventId,
        orderId: params.orderId,
        userId,
      }),
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_SALE_CANCEL_POST");
  }
}
