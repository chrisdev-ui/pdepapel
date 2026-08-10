import { auth } from "@clerk/nextjs";
import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { verifyStoreOwner } from "@/lib/utils";

const supportedPaymentMethods = [
  PaymentMethod.CASH,
  PaymentMethod.BankTransfer,
];

export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
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

    const result = await createPointOfSaleSale({
      storeId: params.storeId,
      items,
      paymentMethod,
      idempotencyKey,
      userId,
    });
    if (!result.duplicate) {
      await invalidateStoreProductsCache(params.storeId);
    }

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return handleErrorResponse(error, "POINT_OF_SALE_SALES_POST");
  }
}
