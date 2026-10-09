import { OrderType } from "@prisma/client";

import { ADMIN_EMAIL_RECIPIENTS, deliverEmails } from "@/lib/email-delivery";
import { isFraudCancelled, parseRiskReasons, withRiskReason } from "@/lib/order-risk";
import prismadb from "@/lib/prismadb";

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";

/**
 * Una aprobación de pago que llega tarde no revive una tarjeta de regalo
 * cancelada ni un pedido cancelado como fraude: emitiría un código o
 * despacharía a un bot. Los demás pedidos siguen como antes.
 */
export function blocksLatePaymentRevival(order: { type: OrderType | string; riskReasons?: string | null }) {
  return order.type === OrderType.GIFT_CARD || isFraudCancelled(order);
}

/**
 * Entró plata en un pedido cancelado: se marca para revisar o reembolsar y se
 * avisa al panel una sola vez. El evento de la pasarela ya quedó guardado en
 * `PaymentWebhookEvent`.
 */
export async function flagPaymentOnCancelledOrder(orderId: string, provider: "Bold" | "Wompi") {
  const order = await prismadb.order.findUnique({
    where: { id: orderId },
    select: { id: true, storeId: true, orderNumber: true, riskScore: true, riskReasons: true },
  });
  if (!order || parseRiskReasons(order.riskReasons).includes("pago-en-cancelado")) return;

  await prismadb.order.update({ where: { id: order.id }, data: withRiskReason(order, "pago-en-cancelado") });

  const link = `${PANEL_ORIGIN}/${order.storeId}/pedidos/${order.id}`;
  const { resend } = await import("@/lib/resend");
  await deliverEmails(
    [
      {
        role: "admin",
        send: () =>
          resend.emails.send({
            from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
            to: ADMIN_EMAIL_RECIPIENTS,
            subject: `⚠️ Pago recibido en pedido cancelado — #${order.orderNumber}`,
            text: `${provider} aprobó un pago del pedido #${order.orderNumber}, que estaba cancelado. No se reactivó ni se emitió nada. Revisa el pedido y reembolsa si corresponde: ${link}`,
          }),
      },
    ],
    { storeId: order.storeId, orderId: order.id, kind: "order:late-payment" },
  );
}
