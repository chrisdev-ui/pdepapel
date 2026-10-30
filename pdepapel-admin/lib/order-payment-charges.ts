import { OrderPaymentKind, OrderPaymentPlan, OrderPaymentStatus, OrderStatus, Prisma, type PaymentMethod } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { depositChargeReference } from "@/lib/order-payment-amounts";
import {
  checkOnlineAmount,
  ONLINE_PAYMENT_KIND,
  ONLINE_REFERENCE_PATTERN,
  onlineChargeReference,
  onlinePaymentState,
  type OnlinePaymentMode,
} from "@/lib/preorder-online-rules";
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

/** Un cobro en línea igual (mismo tipo, valor y pasarela) de hace menos que esto se reutiliza: la clienta volvió a pulsar. */
export const ONLINE_CHARGE_REUSE_MS = 30 * 60 * 1000;

/**
 * El cobro PENDING de un abono o del saldo que se paga desde `/pedido`. Cada
 * uno lleva su referencia `<orderNumber>-P<n>`; el webhook la resuelve a esta
 * fila y nunca toca la del anticipo. Las reglas (mínimo, tope, saldo exacto)
 * se vuelven a decidir aquí, dentro de la transacción, con los pagos de hoy.
 */
export async function createOnlinePreorderCharge(input: {
  storeId: string;
  orderId: string;
  mode: OnlinePaymentMode;
  amount: number;
  method: PaymentMethod;
  now?: Date;
}): Promise<{ reference: string; amount: number; orderNumber: string; chargeId: string }> {
  const now = input.now ?? new Date();
  const attempt = () =>
    prismadb.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.orderId, storeId: input.storeId },
        select: {
          id: true,
          storeId: true,
          orderNumber: true,
          status: true,
          paymentPlan: true,
          total: true,
          giftCardAmount: true,
          depositAmount: true,
          balanceRequestedAt: true,
          orderItems: { select: { isPreorder: true, preorderReleasedAt: true, preorderUnfulfilledAt: true } },
          payments: { select: { id: true, kind: true, status: true, amount: true, method: true, gatewayReference: true, createdAt: true } },
        },
      });
      if (!order) throw ErrorFactory.NotFound("El pedido no existe");
      const state = onlinePaymentState(order);
      const problem = checkOnlineAmount(state, input.mode, input.amount);
      if (problem) throw ErrorFactory.InvalidRequest(problem, { amountDue: state.amountDue, minAmount: state.minAmount });

      const kind = ONLINE_PAYMENT_KIND[input.mode];
      const same = order.payments.find(
        (payment) =>
          payment.status === OrderPaymentStatus.PENDING &&
          payment.kind === kind &&
          Math.round(payment.amount) === input.amount &&
          payment.method === input.method &&
          payment.gatewayReference !== null &&
          ONLINE_REFERENCE_PATTERN.test(payment.gatewayReference) &&
          now.getTime() - payment.createdAt.getTime() < ONLINE_CHARGE_REUSE_MS,
      );
      if (same?.gatewayReference) return { reference: same.gatewayReference, amount: input.amount, orderNumber: order.orderNumber, chargeId: same.id };

      const used = order.payments
        .map((payment) => payment.gatewayReference?.match(/-P(\d+)$/)?.[1])
        .filter((value): value is string => Boolean(value))
        .map(Number);
      const sequence = (used.length ? Math.max(...used) : 0) + 1;
      const created = await tx.orderPayment.create({
        data: {
          storeId: order.storeId,
          orderId: order.id,
          kind,
          status: OrderPaymentStatus.PENDING,
          amount: input.amount,
          method: input.method,
          gatewayReference: onlineChargeReference(order.orderNumber, sequence),
          createdBy: "CUSTOMER",
        },
        select: { id: true, gatewayReference: true },
      });
      return { reference: created.gatewayReference!, amount: input.amount, orderNumber: order.orderNumber, chargeId: created.id };
    });
  try {
    return await attempt();
  } catch (error) {
    // Dos clics a la vez pidieron la misma referencia: el segundo la recalcula una vez.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return attempt();
    throw error;
  }
}
