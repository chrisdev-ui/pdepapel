import {
  Order,
  OrderStatus,
  PaymentMethod,
  Shipping,
  ShippingStatus,
} from "@prisma/client";
import { EmailTemplate } from "@/components/email-template";
import { resend } from "@/lib/resend";
import { getReadablePaymentMethod, getReadableStatus } from "@/lib/utils";

function getOrderSummary(order: any) {
  if (!order.orderItems || !Array.isArray(order.orderItems)) return "";
  return order.orderItems
    .map(
      (item: any) => `• ${item.product?.name || "Producto"} x${item.quantity}`,
    )
    .join("\n");
}

function getOrderLink(orderId: string) {
  // Adjust this URL to your frontend order details page
  return `https://papeleriapdepapel.com/order/${orderId}`;
}

export const sendOrderEmail = async (
  order: Order & {
    payment?: PaymentMethod | null;
    shipping?: Shipping | null;
    orderItems?: any[];
  },
  status: OrderStatus | ShippingStatus,
  options?: { notifyAdmin?: boolean },
) => {
  try {
    const readableStatus = getReadableStatus(status);
    const readablePayment = getReadablePaymentMethod(order.payment);
    const orderSummary = getOrderSummary(order);
    const orderLink = getOrderLink(order.id);

    // Subject lines
    const subjectAdmin = `[Admin] Pedido #${order.orderNumber} - ${readableStatus}`;
    const subjectCustomer = `Tu pedido #${order.orderNumber} - ${readableStatus}`;

    // Thank you paragraph
    const thanksParagraph =
      status === OrderStatus.PAID
        ? "¡Gracias por tu compra! Estamos procesando tu pedido y te notificaremos cuando sea enviado."
        : "Gracias por confiar en nosotros. Si tienes dudas, responde al correo papeleria.pdepapel@gmail.com o contáctanos por WhatsApp.";

    // Send to admin
    if (options?.notifyAdmin !== false) {
      await resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
        subject: subjectAdmin,
        react: EmailTemplate({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status,
          isAdminEmail: true,
          paymentMethod: readablePayment,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          address: order.address,
          phone: order.phone,
          orderSummary,
          orderLink,
          thanksParagraph,
        }),
        text: `Pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\n\n${orderSummary}\n\nVer detalles: ${orderLink}`,
      });
    }

    // Send to customer if email exists
    if (order.email) {
      await resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: [order.email],
        subject: subjectCustomer,
        react: EmailTemplate({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status,
          paymentMethod: readablePayment,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          orderSummary,
          orderLink,
          thanksParagraph,
        }),
        text: `Tu pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\n\n${orderSummary}\n\nVer detalles: ${orderLink}\n\n${thanksParagraph}`,
      });
    }
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
