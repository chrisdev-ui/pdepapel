import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { requireJsonBody } from "@/lib/request-body";
import { parseManualPaymentBody, recordInstallment } from "@/lib/order-payments";
import { verifyStoreOwner } from "@/lib/server/utils";
import { CACHE_HEADERS } from "@/lib/utils";

/**
 * «Registrar abono»: un pago a mano entre el anticipo y el saldo de una
 * preventa que todavía espera. Nunca pasa del total; por defecto no le avisa
 * a la clienta (queda en «Avisos a la clienta»).
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

    const body = await requireJsonBody<Record<string, unknown>>(req, "ORDER_INSTALLMENT_POST");
    const payment = parseManualPaymentBody(body);
    const result = await recordInstallment({
      orderId: params.orderId,
      storeId: params.storeId,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      createdBy: userId,
      note: payment.note,
      notifyCustomer: payment.notifyCustomer,
    });
    return NextResponse.json(result, { headers: CACHE_HEADERS.NO_CACHE });
  } catch (error) {
    return handleErrorResponse(error, "ORDER_INSTALLMENT_POST", {
      headers: CACHE_HEADERS.NO_CACHE,
      expectedStatusCodes: [400, 404, 409],
    });
  }
}
