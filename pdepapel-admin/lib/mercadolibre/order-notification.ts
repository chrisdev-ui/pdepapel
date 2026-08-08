import { MercadoLibreOrderNotification } from "@/emails/mercadolibre-order-notification";
import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";
import { currencyFormatter } from "@/lib/utils";

const ADMIN_NOTIFICATION_RECIPIENTS = [
  "web.christian.dev@gmail.com",
  "papeleria.pdepapel@gmail.com",
];

export async function sendMercadoLibreOrderNotification({
  buyerName,
  inventoryStatus,
  marketplaceOrderId,
  orderNumber,
  orderSummary,
  storeId,
  netAmount,
}: {
  buyerName: string | null;
  inventoryStatus: string;
  marketplaceOrderId: string;
  orderNumber: string;
  orderSummary: string;
  storeId: string;
  netAmount: number;
}) {
  if (env.NODE_ENV === "development") {
    console.log(
      `[EMAIL] Skipping Mercado Libre notification for order #${orderNumber}`,
    );
    return;
  }

  const orderUrl = new URL(
    `/${encodeURIComponent(storeId)}/mercadolibre`,
    env.ADMIN_WEB_URL,
  );
  orderUrl.searchParams.set("order", marketplaceOrderId);
  orderUrl.hash = "mercadolibre-orders";

  const response = await resend.emails.send({
    from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
    to: ADMIN_NOTIFICATION_RECIPIENTS,
    subject: `[Mercado Libre] Nueva venta pagada #${orderNumber}`,
    headers: {
      "Idempotency-Key": `mercadolibre-order-${marketplaceOrderId}`,
    },
    react: MercadoLibreOrderNotification({
      buyerName,
      inventoryStatus,
      orderNumber,
      orderSummary,
      orderUrl: orderUrl.toString(),
      netAmount: currencyFormatter(netAmount),
    }) as React.ReactElement,
    text: `Nueva venta pagada de Mercado Libre #${orderNumber}\nNeto de la venta: ${currencyFormatter(netAmount)}\n\n${orderSummary}\n\nEstado: ${inventoryStatus}\nVer venta en Administración: ${orderUrl}`,
  });
  if (response.error) {
    throw new Error(
      `Resend rechazó la notificación de Mercado Libre: ${response.error.message}`,
    );
  }
}
