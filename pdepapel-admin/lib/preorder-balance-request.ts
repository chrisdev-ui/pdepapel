import { NotificationChannel, OrderNotificationStatus, OrderPaymentPlan, OrderStatus, ShippingProvider } from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { sendPreorderBalanceDueEmail } from "@/lib/email";
import { getAmountDueNow, sumReceived } from "@/lib/order-payment-amounts";
import { settleBalancePayment } from "@/lib/order-payments";
import prismadb from "@/lib/prismadb";
import { silentChangeDedupeKey, silentChangeMilestone } from "@/lib/silent-status-change";

/**
 * «Pedir saldo»: la preventa ya se liberó y Paula cotizó el envío de este
 * pedido. Aquí queda ese envío en el pedido (se suma al total, que es lo que
 * la clienta paga) y `balanceRequestedAt`: desde ahí `/pedido` muestra
 * «Pagar saldo» con el valor exacto. Con «Avisar a la clienta», sale el
 * correo «Ya llegó tu preventa: paga tu saldo».
 *
 * Se puede volver a pedir (cambió el envío): el total se recalcula con el
 * envío nuevo. Para recoger en la tienda el envío es siempre 0. Si con eso no
 * falta nada (todo abonado y retiro en la tienda), pasa a pagado como
 * «Marcar saldo recibido» con $ 0.
 */
export const BALANCE_REQUEST_SILENT_REASON = "Saldo pedido sin avisar";

export interface BalanceRequestInput {
  storeId: string;
  orderId: string;
  shippingCost: number;
  notifyCustomer: boolean;
  createdBy: string;
}

export async function requestPreorderBalance(input: BalanceRequestInput) {
  const shippingCost = Math.round(Number(input.shippingCost));
  if (!Number.isFinite(shippingCost) || shippingCost < 0 || !Number.isInteger(Number(input.shippingCost))) {
    throw ErrorFactory.InvalidRequest("El envío tiene que ser un valor en pesos, cero o más.");
  }

  const result = await prismadb.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: input.orderId, storeId: input.storeId },
      include: {
        orderItems: { select: { isPreorder: true, preorderReleasedAt: true, preorderUnfulfilledAt: true } },
        shipping: { select: { id: true, cost: true, provider: true } },
        payments: { select: { kind: true, status: true, amount: true, method: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw ErrorFactory.NotFound("El pedido no existe en esta tienda");
    if (order.paymentPlan !== OrderPaymentPlan.DEPOSIT || order.status !== OrderStatus.DEPOSIT_PAID) {
      throw ErrorFactory.InvalidRequest("El saldo solo se pide en un pedido con anticipo recibido.");
    }
    const preorderLines = order.orderItems.filter((item) => item.isPreorder);
    if (preorderLines.some((item) => !item.preorderReleasedAt && item.preorderUnfulfilledAt)) {
      throw ErrorFactory.Conflict("A este pedido no le alcanzó la unidad: no se le pide saldo, se cancela con la devolución.");
    }
    if (preorderLines.some((item) => !item.preorderReleasedAt)) {
      throw ErrorFactory.Conflict("Primero libera la preventa en Preventas: el saldo se pide cuando llega la mercancía.");
    }
    const pickup = !order.shipping || order.shipping.provider === ShippingProvider.NONE;
    const shipping = pickup ? 0 : shippingCost;
    const previous = Math.round(Number(order.shipping?.cost ?? 0));
    const total = Math.round(Number(order.total)) - previous + shipping;
    await tx.order.update({ where: { id: order.id }, data: { total, balanceRequestedAt: new Date() } });
    if (order.shipping) await tx.shipping.update({ where: { id: order.shipping.id }, data: { cost: shipping } });
    const due = getAmountDueNow({ ...order, total }, sumReceived(order.payments));
    const lastMethod = order.payments.filter((payment) => payment.status === "APPROVED").at(-1)?.method ?? null;
    return { orderId: order.id, storeId: order.storeId, shippingId: order.shipping?.id ?? null, total, shipping, due, hasEmail: Boolean(order.email), lastMethod };
  });

  // Ya pagó todo con abonos y no hay envío que cobrar: no hay saldo que pedir, el pedido pasa a pagado.
  if (result.due <= 0 && result.lastMethod) {
    await settleBalancePayment({
      orderId: result.orderId,
      storeId: input.storeId,
      amount: 0,
      method: result.lastMethod,
      paidAt: new Date(),
      createdBy: input.createdBy,
      shippingCost: null,
      notifyCustomer: input.notifyCustomer && result.hasEmail,
    });
    return { total: result.total, shipping: result.shipping, amountDue: 0, completed: true };
  }

  await invalidateStoreProductsCache(input.storeId, { orderIds: [input.orderId] });
  if (input.notifyCustomer && result.hasEmail) {
    runInBackground("correo de saldo de preventa", () => sendPreorderBalanceDueEmail(result.orderId));
  } else {
    try {
      await prismadb.orderNotification.create({
        data: {
          storeId: result.storeId,
          orderId: result.orderId,
          shippingId: result.shippingId,
          milestone: silentChangeMilestone(OrderStatus.DEPOSIT_PAID),
          channel: NotificationChannel.EMAIL,
          role: "customer",
          status: OrderNotificationStatus.SKIPPED,
          reason: result.hasEmail ? BALANCE_REQUEST_SILENT_REASON : "Saldo pedido: la clienta no tiene correo",
          createdBy: input.createdBy,
          dedupeKey: silentChangeDedupeKey(result.orderId),
        },
      });
    } catch (error) {
      console.error("[PREORDER_BALANCE] No se pudo anotar el aviso omitido:", { orderId: result.orderId, error });
    }
  }
  return { total: result.total, shipping: result.shipping, amountDue: result.due, completed: false };
}
