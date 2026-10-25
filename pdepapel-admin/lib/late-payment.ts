import { OrderType } from "@prisma/client";

import { deliverEmails } from "@/lib/email-delivery";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { isFraudCancelled, parseRiskReasons, withRiskReason } from "@/lib/order-risk";
import prismadb from "@/lib/prismadb";
import { PanelNotice } from "@/emails/panel-notice";

const PANEL_ORIGIN = "https://admin.papeleriapdepapel.com";

/**
 * Una aprobación de pago que llega tarde no revive una tarjeta de regalo
 * cancelada, un pedido cancelado como fraude ni una venta presencial que se
 * deshizo en caja (punto de venta o feria): emitiría un código, despacharía a
 * un bot o contaría dos veces la venta del mostrador. Esos quedan marcados
 * para revisar o reembolsar; los demás pedidos se reviven.
 */
export function blocksLatePaymentRevival(order: { type: OrderType | string; riskReasons?: string | null }) {
  return (
    order.type === OrderType.GIFT_CARD ||
    order.type === OrderType.POINT_OF_SALE ||
    order.type === OrderType.FESTIVAL ||
    isFraudCancelled(order)
  );
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
  const to = await getAdminNotificationRecipients(order.storeId);
  if (to.length === 0) {
    console.warn("[LATE_PAYMENT] Sin correos para avisos en Configuración ni correo de la tienda; no se avisa.");
    return;
  }
  const { resend } = await import("@/lib/resend");
  await deliverEmails(
    [
      {
        role: "admin",
        send: () =>
          resend.emails.send({
            from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
            to,
            subject: `⚠️ Pago recibido en pedido cancelado — #${order.orderNumber}`,
            react: PanelNotice({
              preview: `Pago recibido en el pedido cancelado #${order.orderNumber}`,
              label: "Panel · Pagos",
              title: "Pago en un pedido cancelado",
              meta: `Pedido #${order.orderNumber} · ${provider}`,
              summary: `${provider} aprobó un pago del pedido #${order.orderNumber}, que estaba cancelado. No se reactivó ni se emitió nada.`,
              action: "Revisa el pedido y reembolsa si corresponde.",
              cta: { href: link, label: "Abrir el pedido" },
            }) as React.ReactElement,
            text: `${provider} aprobó un pago del pedido #${order.orderNumber}, que estaba cancelado. No se reactivó ni se emitió nada. Revisa el pedido y reembolsa si corresponde: ${link}`,
          }),
      },
    ],
    { storeId: order.storeId, orderId: order.id, kind: "order:late-payment" },
  );
}

/**
 * Un pago tardío reactivó un pedido cancelado (regla común de Bold y Wompi
 * desde el 2026-10-26). Sale una vez por pedido: el reclamo desde CANCELLED
 * solo gana una vez. Si al reactivar ya no había stock, el pedido quedó
 * pagado con sus incidencias DECREMENT y el correo lo dice.
 */
export async function notifyLatePaymentRevival(input: { orderId: string; provider: "Bold" | "Wompi"; stockShortfall: number }) {
  const order = await prismadb.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, storeId: true, orderNumber: true },
  });
  if (!order) return;
  const link = `${PANEL_ORIGIN}/${order.storeId}/pedidos/${order.id}`;
  const to = await getAdminNotificationRecipients(order.storeId);
  if (to.length === 0) {
    console.warn("[LATE_PAYMENT] Sin correos para avisos en Configuración ni correo de la tienda; no se avisa.");
    return;
  }
  const withoutStock = input.stockShortfall > 0;
  const lines = input.stockShortfall === 1 ? "1 línea" : `${input.stockShortfall} líneas`;
  const summary = withoutStock
    ? `${input.provider} aprobó un pago del pedido #${order.orderNumber}, que estaba cancelado. El pedido volvió a «Pagado», pagado sin stock: ${lines} no se pudieron descontar porque las unidades ya no estaban.`
    : `${input.provider} aprobó un pago del pedido #${order.orderNumber}, que estaba cancelado. El pedido volvió a «Pagado» y su inventario se descontó.`;
  const action = withoutStock
    ? "Revisa el pedido: consigue las unidades o reembolsa. La guía no se crea sola mientras falte stock."
    : "Revisa el pedido antes de despacharlo.";
  const { resend } = await import("@/lib/resend");
  await deliverEmails(
    [
      {
        role: "admin",
        send: () =>
          resend.emails.send({
            from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
            to,
            subject: withoutStock
              ? `⚠️ Pedido cancelado reactivado por un pago, pagado sin stock — #${order.orderNumber}`
              : `⚠️ Pedido cancelado reactivado por un pago — #${order.orderNumber}`,
            react: PanelNotice({
              preview: `Un pago reactivó el pedido cancelado #${order.orderNumber}`,
              label: "Panel · Pagos",
              title: withoutStock ? "Pedido reactivado, pagado sin stock" : "Pedido cancelado reactivado por un pago",
              meta: `Pedido #${order.orderNumber} · ${input.provider}`,
              summary,
              action,
              cta: { href: link, label: "Abrir el pedido" },
            }) as React.ReactElement,
            text: `${summary} ${action} ${link}`,
          }),
      },
    ],
    { storeId: order.storeId, orderId: order.id, kind: "order:late-payment-revived" },
  );
}
