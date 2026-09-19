import { auth } from "@clerk/nextjs/server";
import { PaymentMethod } from "@prisma/client";
import { NextResponse } from "next/server";

import { ErrorFactory, handleErrorResponse } from "@/lib/api-errors";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { chargePointOfSaleOnTerminal, createPointOfSaleSale, POINT_OF_SALE_PAYMENT_METHODS } from "@/lib/point-of-sale";
import { verifyStoreOwner } from "@/lib/utils";


export async function POST(
  req: Request,
  { params }: { params: { storeId: string } },
) {
  try {
    const { userId } = await auth();
    if (!userId) throw ErrorFactory.Unauthenticated();
    await verifyStoreOwner(userId, params.storeId);

    const { items, paymentMethod, idempotencyKey, transactionId } = await req.json();
    if (!Array.isArray(items)) {
      throw ErrorFactory.InvalidRequest(
        "Los productos de la venta son requeridos",
      );
    }
    if (!POINT_OF_SALE_PAYMENT_METHODS.includes(paymentMethod)) {
      throw ErrorFactory.InvalidRequest("Elige efectivo, transferencia o datáfono");
    }

    const result = await createPointOfSaleSale({
      storeId: params.storeId,
      items,
      paymentMethod,
      idempotencyKey,
      userId,
      transactionId,
    });
    // Datáfono: el pedido pendiente ya existe; ahora se le manda el cobro a Bold.
    let terminal: string | null = null;
    if (result.pending && !result.duplicate && paymentMethod === PaymentMethod.Bold) {
      terminal = (await chargePointOfSaleOnTerminal({ storeId: params.storeId, orderId: result.order.id })).message;
    }
    if (!result.duplicate && !result.pending) {
      await invalidateStoreProductsCache(params.storeId);
    }

    return NextResponse.json({ ...result, terminal }, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    return handleErrorResponse(error, "POINT_OF_SALE_SALES_POST");
  }
}
