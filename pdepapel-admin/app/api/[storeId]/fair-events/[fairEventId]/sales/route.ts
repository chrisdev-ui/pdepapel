import { auth } from "@clerk/nextjs";
import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { createFairSale } from "@/lib/fair-events";
import { verifyStoreOwner } from "@/lib/utils";

const supportedPaymentMethods = [
  PaymentMethod.CASH,
  PaymentMethod.BankTransfer,
];

export async function POST(
  req: Request,
  { params }: { params: { storeId: string; fairEventId: string } },
) {
  try {
    const { userId } = auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const { items, paymentMethod, idempotencyKey } = await req.json();
    if (!Array.isArray(items)) {
      throw ErrorFactory.InvalidRequest(
        "Los productos de la venta son requeridos",
      );
    }
    if (!supportedPaymentMethods.includes(paymentMethod)) {
      throw ErrorFactory.InvalidRequest("Selecciona efectivo o transferencia");
    }

    return NextResponse.json(
      await createFairSale({
        storeId: params.storeId,
        fairEventId: params.fairEventId,
        items,
        paymentMethod,
        idempotencyKey,
        userId,
      }),
      { status: 201 },
    );
  } catch (error) {
    return handleErrorResponse(error, "FAIR_EVENT_SALES_POST");
  }
}
