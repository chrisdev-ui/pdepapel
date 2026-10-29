import { OrderPaymentKind, OrderPaymentPlan, OrderPaymentStatus, OrderStatus, type PaymentMethod, type Prisma } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { depositChargeReference } from "@/lib/order-payment-amounts";
import prismadb from "@/lib/prismadb";

/**
 * El cobro del anticipo que firman Bold y Wompi. Aparte de
 * `lib/order-payments.ts` para que las rutas de pago no carguen correos ni
 * inventario solo para firmar un enlace.
 */

/**
 * El cobro del anticipo que el checkout deja listo para la pasarela. Un pedido
 * tiene uno solo: si ya existe (la clienta reintenta el pago), se reutiliza.
 */
export async function ensurePendingDepositCharge(
  tx: Prisma.TransactionClient,
  order: { id: string; storeId: string; orderNumber: string; depositAmount: number | null },
  method: PaymentMethod,
) {
  const reference = depositChargeReference(order.orderNumber);
  const existing = await tx.orderPayment.findFirst({ where: { orderId: order.id, kind: OrderPaymentKind.DEPOSIT } });
  if (existing) return existing;
  return tx.orderPayment.create({
    data: {
      storeId: order.storeId,
      orderId: order.id,
      kind: OrderPaymentKind.DEPOSIT,
      status: OrderPaymentStatus.PENDING,
      amount: Math.round(Number(order.depositAmount ?? 0)),
      method,
      gatewayReference: reference,
      createdBy: "SYSTEM",
    },
  });
}

/**
 * Qué firma la pasarela para este pedido. Null en un pedido normal (referencia
 * y monto de siempre). Con anticipo pendiente: la referencia y el valor del
 * anticipo; con el anticipo ya pagado no hay enlace (el saldo, Lote 2).
 */
export async function resolveGatewayCharge(
  order: { id: string; storeId: string; orderNumber: string; status: OrderStatus; paymentPlan: OrderPaymentPlan; depositAmount: number | null },
  method: PaymentMethod,
): Promise<{ reference: string; amount: number } | null> {
  if (order.paymentPlan !== OrderPaymentPlan.DEPOSIT) return null;
  if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.CREATED) {
    throw ErrorFactory.Conflict(
      order.status === OrderStatus.DEPOSIT_PAID
        ? `El anticipo del pedido #${order.orderNumber} ya está pagado. El saldo se cobra cuando llegue el producto.`
        : `El pedido #${order.orderNumber} ya no se puede pagar en línea.`,
    );
  }
  const charge = await prismadb.$transaction((tx) => ensurePendingDepositCharge(tx, order, method));
  if (!charge.gatewayReference || charge.amount <= 0) {
    throw ErrorFactory.Conflict(`El anticipo del pedido #${order.orderNumber} no está listo para cobrarse.`);
  }
  return { reference: charge.gatewayReference, amount: Math.round(charge.amount) };
}
