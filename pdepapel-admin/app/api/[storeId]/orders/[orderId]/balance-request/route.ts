import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { parseNotifyCustomer } from "@/lib/silent-status-change";
import { requestPreorderBalance } from "@/lib/preorder-balance-request";
import { requireJsonBody } from "@/lib/request-body";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * «Pedir saldo»: la preventa llegó y Paula puso el envío de este pedido. Desde
 * aquí `/pedido` deja pagar el saldo exacto en línea o por transferencia. Con
 * «Avisar a la clienta» (encendido por defecto) sale el correo «Ya llegó».
 */
export async function POST(req: Request, { params }: { params: { storeId: string; orderId: string } }) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await requireJsonBody<Record<string, unknown>>(req, "ORDER_BALANCE_REQUEST_POST");
    const notifyCustomer = parseNotifyCustomer(body);
    if (notifyCustomer === null) throw ErrorFactory.InvalidRequest("«Avisar a la clienta» tiene que ser sí o no");
    const result = await requestPreorderBalance({
      storeId: params.storeId,
      orderId: params.orderId,
      shippingCost: Number(body.shippingCost ?? 0),
      notifyCustomer,
      createdBy: userId,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_BALANCE_REQUEST_POST", { headers: CACHE_HEADERS.NO_CACHE, expectedStatusCodes: [400, 404, 409] });
  }
}
