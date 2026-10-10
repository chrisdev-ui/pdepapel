import { MercadoLibreOrderNotification } from "@/emails/mercadolibre-order-notification";
import { env } from "@/lib/env.mjs";
import { resend } from "@/lib/resend";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";
import { currencyFormatter } from "@/lib/utils";


function formatPaidAt(paidAt: Date | null) {
  if (!paidAt) return null;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(paidAt);
}

export async function sendMercadoLibreOrderNotification({
  buyerName,
  inventoryStatus,
  marketplaceOrderId,
  orderNumber,
  paidAt,
  orderSummary,
  storeId,
  netAmount,
}: {
  buyerName: string | null;
  inventoryStatus: string;
  marketplaceOrderId: string;
  orderNumber: string;
  paidAt: Date | null;
  orderSummary: string;
  storeId: string;
  netAmount: number | null;
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
  const paidAtLabel = formatPaidAt(paidAt);
  const to = await getAdminNotificationRecipients(storeId);
  if (to.length === 0) {
    throw new Error("Sin correos para avisos en Configuración ni correo de la tienda");
  }

  const response = await resend.emails.send({
    from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
    to,
    subject: `[Mercado Libre] Venta pagada y registrada #${orderNumber}`,
    headers: {
      "Idempotency-Key": `mercadolibre-order-${marketplaceOrderId}`,
    },
    react: MercadoLibreOrderNotification({
      buyerName,
      inventoryStatus,
      orderNumber,
      orderSummary,
      orderUrl: orderUrl.toString(),
      netAmount: netAmount === null ? null : currencyFormatter(netAmount),
      paidAt: paidAtLabel,
    }) as React.ReactElement,
    text: `Venta pagada y registrada de Mercado Libre #${orderNumber}\n${paidAtLabel ? `Pago confirmado: ${paidAtLabel}\n` : ""}${netAmount === null ? "Liquidación neta: pendiente de publicación por Mercado Libre\n" : `Neto de la venta: ${currencyFormatter(netAmount)}\n`}\n${orderSummary}\n\nEstado: ${inventoryStatus}\nVer venta en Administración: ${orderUrl}`,
  });
  if (response.error) {
    throw new Error(
      `Resend rechazó la notificación de Mercado Libre: ${response.error.message}`,
    );
  }
}
