import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireJsonBody } from "@/lib/request-body";
import { parseManualPaymentBody, settleBalancePayment } from "@/lib/order-payments";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * «Marcar saldo recibido»: el saldo de una preventa con anticipo, cobrado por
 * fuera (mientras el cobro en línea del saldo no exista). Pasa el pedido a
 * PAGADO con `paidAt`, financieros y GA4 `purchase`. `shippingCost` es el envío
 * que se cobró con el saldo. Por defecto no le avisa a la clienta.
 */
export async function POST(
  req: Request,
  { params }: { params: { storeId: string; orderId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    if (!params.storeId) throw ErrorFactory.MissingStoreId();
    await verifyStoreOwner(userId, params.storeId);

    const body = await requireJsonBody<Record<string, unknown>>(req, "ORDER_BALANCE_POST");
    const payment = parseManualPaymentBody(body);
    const rawShipping = body?.shippingCost;
    const shippingCost = rawShipping === undefined || rawShipping === null || rawShipping === "" ? null : Number(rawShipping);

    const result = await settleBalancePayment({
      orderId: params.orderId,
      storeId: params.storeId,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      createdBy: userId,
      shippingCost,
      note: payment.note,
      notifyCustomer: payment.notifyCustomer,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_BALANCE_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
