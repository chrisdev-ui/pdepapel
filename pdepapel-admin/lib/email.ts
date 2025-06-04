import {
  Order,
  OrderStatus,
  PaymentMethod,
  Shipping,
  ShippingStatus,
} from "@prisma/client";
import { EmailTemplate } from "@/components/email-template";
import { resend } from "@/lib/resend";

export const sendOrderEmail = async (
  order: Order & { payment?: PaymentMethod | null; shipping?: Shipping | null },
  status: OrderStatus | ShippingStatus,
) => {
  try {
    // Send to admin
    await resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
      subject: `[Admin] Pedido #${order.orderNumber} - ${status}`,
      react: EmailTemplate({
        name: order.fullName,
        orderNumber: order.orderNumber,
        status,
        isAdminEmail: true,
        paymentMethod: order.payment ? String(order.payment) : undefined,
        trackingInfo: order.shipping?.trackingCode ?? undefined,
        address: order.address,
        phone: order.phone,
      }),
      text: `Pedido #${order.orderNumber} - ${status} para ${order.fullName}`,
    });

    // Send to customer if email exists
    if (order.email) {
      await resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: [order.email],
        subject: `Tu pedido #${order.orderNumber} - ${status}`,
        react: EmailTemplate({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status,
          paymentMethod: order.payment ? String(order.payment) : undefined,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
        }),
        text: `Tu pedido #${order.orderNumber} - ${status} para ${order.fullName}`,
      });
    }
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
