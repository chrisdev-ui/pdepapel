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
import { env } from "@/lib/env.mjs";

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
    // SKIP email sending in development environment
    if (env.NODE_ENV === "development") {
      console.log(
        `[EMAIL] Skipping email in development for order #${order.orderNumber} - ${status}`,
      );
      console.log(`[EMAIL] Would send to: ${order.email || "N/A"} and admins`);
      return;
    }

    // SKIP shipping status emails - they are handled by webhook only
    const shippingStatuses = [
      ShippingStatus.Preparing,
      ShippingStatus.Shipped,
      ShippingStatus.PickedUp,
      ShippingStatus.InTransit,
      ShippingStatus.OutForDelivery,
      ShippingStatus.Delivered,
      ShippingStatus.FailedDelivery,
      ShippingStatus.Returned,
      ShippingStatus.Cancelled,
      ShippingStatus.Exception,
    ];

    if (shippingStatuses.includes(status as ShippingStatus)) {
      console.log(
        `[EMAIL] Skipping email for shipping status ${status} - handled by webhook`,
      );
      return;
    }

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
          email: order.email || undefined,
          total: order.total
            ? new Intl.NumberFormat("es-CO", {
                style: "currency",
                currency: "COP",
              }).format(order.total)
            : undefined,
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

/**
 * Envía email de notificación de envío/entrega
 * SOLO debe ser llamada desde el webhook de EnvioClick para evitar duplicados
 */
export const sendShippingEmail = async (
  order: Order & {
    payment?: PaymentMethod | null;
    shipping?: Shipping | null;
    orderItems?: any[];
  },
  shippingStatus: ShippingStatus,
) => {
  try {
    // SKIP email sending in development environment
    if (env.NODE_ENV === "development") {
      console.log(
        `[EMAIL] Skipping shipping email in development for order #${order.orderNumber} - ${shippingStatus}`,
      );
      console.log(`[EMAIL] Would send to: ${order.email || "N/A"} and admins`);
      return;
    }

    const readableStatus = getReadableStatus(shippingStatus);
    const orderSummary = getOrderSummary(order);
    const orderLink = getOrderLink(order.id);

    // Subject lines según el estado
    let subjectCustomer = `Tu pedido #${order.orderNumber} - ${readableStatus}`;
    let thanksParagraph = "Gracias por confiar en nosotros.";

    // Personalizar mensaje según el estado
    switch (shippingStatus) {
      case ShippingStatus.Shipped:
      case ShippingStatus.PickedUp:
        thanksParagraph =
          "Tu pedido ha sido recogido por la transportadora y está en camino. Te notificaremos cuando esté cerca de ser entregado.";
        break;
      case ShippingStatus.InTransit:
        thanksParagraph =
          "Tu pedido está en tránsito hacia tu ubicación. Pronto recibirás una notificación cuando esté listo para entrega.";
        break;
      case ShippingStatus.OutForDelivery:
        thanksParagraph =
          "¡Tu pedido está en camino! Será entregado hoy. Por favor asegúrate de estar disponible para recibirlo.";
        subjectCustomer = `¡Tu pedido #${order.orderNumber} está en camino!`;
        break;
      case ShippingStatus.Delivered:
        thanksParagraph =
          "¡Esperamos que disfrutes tu compra! Si tienes algún problema con tu pedido, por favor contáctanos.";
        subjectCustomer = `¡Tu pedido #${order.orderNumber} ha sido entregado!`;
        break;
      case ShippingStatus.FailedDelivery:
        thanksParagraph =
          "No pudimos entregar tu pedido. Por favor contáctanos para coordinar una nueva entrega.";
        break;
      case ShippingStatus.Returned:
        thanksParagraph =
          "Tu pedido ha sido devuelto. Por favor contáctanos para más información.";
        break;
    }

    const subjectAdmin = `[Admin] Pedido #${order.orderNumber} - ${readableStatus}`;

    // Send to admin
    await resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to: ["web.christian.dev@gmail.com", "papeleria.pdepapel@gmail.com"],
      subject: subjectAdmin,
      react: EmailTemplate({
        name: order.fullName,
        orderNumber: order.orderNumber,
        status: shippingStatus,
        isAdminEmail: true,
        paymentMethod: getReadablePaymentMethod(order.payment),
        trackingInfo: order.shipping?.trackingCode ?? undefined,
        email: order.email || undefined,
        total: order.total
          ? new Intl.NumberFormat("es-CO", {
              style: "currency",
              currency: "COP",
            }).format(order.total)
          : undefined,
        address: order.address,
        phone: order.phone,
        orderSummary,
        orderLink,
        thanksParagraph,
      }),
      text: `Pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\n\n${orderSummary}\n\nVer detalles: ${orderLink}`,
    });

    // Send to customer if email exists
    if (order.email) {
      await resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: [order.email],
        subject: subjectCustomer,
        react: EmailTemplate({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status: shippingStatus,
          paymentMethod: getReadablePaymentMethod(order.payment),
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          orderSummary,
          orderLink,
          thanksParagraph,
        }),
        text: `${subjectCustomer}\n\n${orderSummary}\n\nVer detalles: ${orderLink}\n\n${thanksParagraph}`,
      });
    }

    console.log(
      `[EMAIL] Shipping notification sent for order #${order.orderNumber} - ${shippingStatus}`,
    );
  } catch (error) {
    console.error("[EMAIL] Error sending shipping email:", error);
  }
};
