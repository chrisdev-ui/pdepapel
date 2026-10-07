import {
  Order,
  OrderStatus,
  OrderAccountClaimSource,
  PaymentMethod,
  Shipping,
  ShippingStatus,
  OrderType,
} from "@prisma/client";
import type { EmailLineItem } from "@/emails/components";
import { GiftNotification } from "@/emails/gift-notification";
import { OrderNotification } from "@/emails/order-notification";
import { getGiftNotificationEmail, isGiftOrder } from "@/lib/gift-orders";
import { resend } from "@/lib/resend";
import { recordFailedNotification } from "@/lib/notification-failures";
import {
  ADMIN_EMAIL_RECIPIENTS,
  deliverEmails,
  EMAIL_ROLES,
  type EmailJob,
  type EmailRole,
} from "@/lib/email-delivery";
import {
  currencyFormatter,
  getReadablePaymentMethod,
  getReadableStatus,
} from "@/lib/utils";
import { env } from "@/lib/env.mjs";
import {
  createOrderAccountClaimToken,
  ORDER_ACCOUNT_EMAIL_CLAIM_TTL_MS,
} from "@/lib/order-account-claims";
import prismadb from "@/lib/prismadb";

/**
 * Las líneas del pedido, con cantidad y precio.
 *
 * El nombre sale del campo congelado de `OrderItem`, no del producto vivo: un
 * pedido pagado es una foto de lo que se compró, y si el producto se renombra
 * después el correo viejo no puede cambiar de contenido.
 *
 * El precio es el de la línea (unitario × cantidad), no el unitario: es lo que
 * suma al total que aparece debajo.
 */
function getOrderLineItems(order: any): EmailLineItem[] {
  if (!order.orderItems || !Array.isArray(order.orderItems)) return [];
  return order.orderItems.map((item: any) => {
    const quantity = typeof item.quantity === "number" ? item.quantity : 1;
    const unitPrice = typeof item.price === "number" ? item.price : null;
    return {
      name: item.name || item.product?.name || "Producto",
      quantity,
      price:
        unitPrice !== null && unitPrice > 0
          ? currencyFormatter(unitPrice * quantity)
          : null,
    };
  });
}

/**
 * El mismo resumen en texto plano, para el cuerpo `text` que reciben los
 * clientes de correo que rechazan HTML. Nunca se deja de mandar.
 */
function getOrderSummary(order: any) {
  return getOrderLineItems(order)
    .map(
      (item) =>
        `• ${item.name} x${item.quantity}${item.price ? ` — ${item.price}` : ""}`,
    )
    .join("\n");
}

function getOrderLink(orderId: string) {
  // Adjust this URL to your frontend order details page
  return `https://papeleriapdepapel.com/pedido/${orderId}`;
}

async function getOrderAccountClaimEmailLink(order: Order) {
  if (!order.email || order.userId || order.type !== OrderType.STANDARD) {
    return null;
  }

  const { token, tokenHash, expiresAt } = createOrderAccountClaimToken(
    ORDER_ACCOUNT_EMAIL_CLAIM_TTL_MS,
  );

  await prismadb.orderAccountClaim.upsert({
    where: {
      orderId_source: {
        orderId: order.id,
        source: OrderAccountClaimSource.EMAIL,
      },
    },
    update: {
      storeId: order.storeId,
      tokenHash,
      expiresAt,
      claimedAt: null,
    },
    create: {
      storeId: order.storeId,
      orderId: order.id,
      source: OrderAccountClaimSource.EMAIL,
      tokenHash,
      expiresAt,
    },
  });

  return `${getOrderLink(order.id)}#guardar-pedido=${encodeURIComponent(token)}`;
}

type NotifiableOrder = Order & {
  shipping?: Shipping | null;
};

/**
 * El aviso a quien recibe un regalo: sin productos, precios, totales ni
 * enlace del pedido. Solo cuando el pedido es regalo, dejó un correo y ese
 * correo no es el de quien compra (que ya recibe el recibo completo).
 *
 * Nunca en PENDING: un regalo no se anuncia antes de que el pago exista.
 * Un fallo aquí no tumba el correo de la clienta: se registra aparte.
 */
async function sendGiftNotification(
  order: NotifiableOrder,
  status: OrderStatus | ShippingStatus,
) {
  const recipient = getGiftNotificationEmail(order);
  if (!recipient) return;

  const trackingInfo = order.shipping?.trackingCode ?? undefined;
  const recipientName = order.giftRecipientName || "";
  const buyerName = order.fullName || "Alguien";
  const subject =
    status === OrderStatus.PAID
      ? `${buyerName} te envió un regalo de P de Papel`
      : `Tu regalo de ${buyerName} · ${getReadableStatus(status)}`;

  try {
    await resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to: [recipient],
      subject,
      react: GiftNotification({
        recipientName,
        buyerName,
        message: order.giftMessage,
        status: status as string,
        trackingInfo,
      }) as React.ReactElement,
      text: [
        `${buyerName} te envió un regalo de P de Papel.`,
        order.giftMessage ? `Mensaje: «${order.giftMessage}»` : "",
        trackingInfo
          ? `Guía de envío: ${trackingInfo}\nSeguimiento: https://www.envioclick.com/co/track/${trackingInfo}`
          : "",
        "Este aviso no muestra qué hay dentro ni cuánto costó: es una sorpresa.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
  } catch (error) {
    console.error("[EMAIL] Error sending gift notification:", error);
    await recordFailedNotification({
      storeId: order.storeId,
      channel: "EMAIL",
      kind: `gift:${status}`,
      recipient,
      orderId: order.id,
      error,
    });
  }
}

function getOrderNotificationSource(status: OrderStatus | ShippingStatus) {
  if (status === OrderStatus.PAID) {
    return "Confirmación de pago recibida en P de Papel.";
  }
  if (status === OrderStatus.PENDING) {
    return "Pedido creado o actualizado en P de Papel.";
  }
  return "Actualización del estado del pedido en P de Papel.";
}

export const sendOrderEmail = async (
  order: Order & {
    payment?: PaymentMethod | null;
    shipping?: Shipping | null;
    orderItems?: any[];
  },
  status: OrderStatus | ShippingStatus,
  options?: {
    notifyAdmin?: boolean;
    /** Solo estos destinatarios (el barrido de reintentos manda uno a la vez). */
    roles?: EmailRole[];
    /** false: quien llama registra los fallos (el barrido cuenta intentos). */
    recordFailures?: boolean;
  },
) => {
  const kind = `order:${status}`;
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
    // Compra de tarjeta de regalo: no se empaca ni se envía; el código sale
    // en otro correo (lib/gift-card-delivery.ts).
    const digital = order.type === OrderType.GIFT_CARD;
    const orderItems = getOrderLineItems(order);
    const orderSummary = getOrderSummary(order);
    const orderLink = getOrderLink(order.id);
    const accountClaimLink =
      status === OrderStatus.PENDING
        ? await getOrderAccountClaimEmailLink(order)
        : null;

    // Subject lines
    const subjectAdmin = `[Admin] Pedido #${order.orderNumber} - ${readableStatus}`;
    const subjectCustomer = `Tu pedido #${order.orderNumber} - ${readableStatus}`;

    // Thank you paragraph
    const giftCardTarget = order.giftRecipientEmail
      ? `al correo de ${order.giftRecipientName || "quien la recibe"}`
      : "a tu correo";
    const thanksParagraph = digital
      ? status === OrderStatus.PAID
        ? `¡Gracias! El código de la tarjeta de regalo ya salió ${giftCardTarget}, en un correo aparte.`
        : "Recibimos tu compra de la tarjeta de regalo. En cuanto el pago se confirme, el código sale por correo."
      : status === OrderStatus.PAID
        ? "¡Gracias por tu compra! Estamos procesando tu pedido y te notificaremos cuando sea enviado."
        : "Gracias por confiar en nosotros. Si tienes dudas, responde al correo papeleria.pdepapel@gmail.com o contáctanos por WhatsApp.";

    // Cada destinatario por su lado (lib/email-delivery.ts): si falla el del
    // admin, el de la clienta sale igual, y cada fallo queda registrado.
    const wanted = new Set<EmailRole>(options?.roles ?? EMAIL_ROLES);
    const jobs: EmailJob[] = [];

    if (options?.notifyAdmin !== false && wanted.has("admin")) {
      jobs.push({ role: "admin", send: () => resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: ADMIN_EMAIL_RECIPIENTS,
        subject: subjectAdmin,
        react: OrderNotification({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status: status as string,
          isAdminEmail: true,
          paymentMethod: readablePayment,
          city: order.city || undefined,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          email: order.email || undefined,
          total: order.total ? currencyFormatter(order.total) : undefined,
          address: order.address,
          phone: order.phone,
          items: orderItems,
          orderSummary,
          orderLink,
          thanksParagraph,
          notificationSource: getOrderNotificationSource(status),
          giftRecipientName: isGiftOrder(order) && !digital
            ? order.giftRecipientName
            : null,
          digital,
        }) as React.ReactElement,
        text: `Pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\nOrigen del aviso: ${getOrderNotificationSource(status)}\n\n${orderSummary}\n\nVer detalles: ${orderLink}`,
      }) });
    }

    const customerEmail = order.email;
    if (customerEmail && wanted.has("customer")) {
      jobs.push({ role: "customer", send: () => resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: [customerEmail],
        subject: subjectCustomer,
        react: OrderNotification({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status: status as string,
          paymentMethod: readablePayment,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          items: orderItems,
          orderSummary,
          city: order.city || undefined,
          orderLink,
          thanksParagraph,
          accountClaimLink,
          giftRecipientName: isGiftOrder(order) && !digital
            ? order.giftRecipientName
            : null,
          digital,
        }) as React.ReactElement,
        text: `Tu pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\n\n${orderSummary}\n\nVer detalles: ${orderLink}${accountClaimLink ? `\n\nGuarda este pedido en tu cuenta: ${accountClaimLink}` : ""}\n\n${thanksParagraph}`,
      }) });
    }

    const outcomes = await deliverEmails(jobs, {
      storeId: order.storeId,
      orderId: order.id,
      kind,
      recordFailures: options?.recordFailures,
    });

    // El regalo se anuncia a quien recibe solo con el pago confirmado. Una
    // tarjeta de regalo tiene su propio correo con el código: no se avisa dos veces.
    if (status === OrderStatus.PAID && !digital && !options?.roles) {
      await sendGiftNotification(order, status);
    }
    return outcomes;
  } catch (error) {
    // Algo falló antes de mandar (armar el correo, leer la base): no salió
    // ninguno de los dos.
    console.error("Error sending email:", error);
    if (options?.recordFailures !== false) {
      for (const role of options?.roles ?? EMAIL_ROLES) {
        if (role === "admin" && options?.notifyAdmin === false) continue;
        if (role === "customer" && !order.email) continue;
        await recordFailedNotification({
          storeId: order.storeId,
          channel: "EMAIL",
          kind,
          recipient: role,
          orderId: order.id,
          error,
        });
      }
    }
    return Object.fromEntries(
      (options?.roles ?? EMAIL_ROLES).map((role) => [
        role,
        { ok: false, attempts: 0, error: error instanceof Error ? error.message : String(error), retryable: true },
      ]),
    ) as Awaited<ReturnType<typeof deliverEmails>>;
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
  options?: { roles?: EmailRole[]; recordFailures?: boolean },
) => {
  const kind = `shipping:${shippingStatus}`;
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
    const orderItems = getOrderLineItems(order);
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

    const wanted = new Set<EmailRole>(options?.roles ?? EMAIL_ROLES);
    const jobs: EmailJob[] = [];

    if (wanted.has("admin")) {
      jobs.push({ role: "admin", send: () => resend.emails.send({
      from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
      to: ADMIN_EMAIL_RECIPIENTS,
      subject: subjectAdmin,
      react: OrderNotification({
        name: order.fullName,
        orderNumber: order.orderNumber,
        status: shippingStatus as string,
        isAdminEmail: true,
        paymentMethod: getReadablePaymentMethod(order.payment),
        trackingInfo: order.shipping?.trackingCode ?? undefined,
        email: order.email || undefined,
        total: order.total ? currencyFormatter(order.total) : undefined,
        address: order.address,
        city: order.city || undefined,
        phone: order.phone,
        items: orderItems,
        orderSummary,
        orderLink,
        thanksParagraph,
        notificationSource: "Actualización de envío recibida desde EnvíoClick.",
        giftRecipientName: isGiftOrder(order) ? order.giftRecipientName : null,
      }) as React.ReactElement,
      text: `Pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\nOrigen del aviso: Actualización de envío recibida desde EnvíoClick.\n\n${orderSummary}\n\nVer detalles: ${orderLink}`,
    }) });
    }

    const customerEmail = order.email;
    if (customerEmail && wanted.has("customer")) {
      jobs.push({ role: "customer", send: () => resend.emails.send({
        from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
        to: [customerEmail],
        subject: subjectCustomer,
        react: OrderNotification({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status: shippingStatus as string,
          paymentMethod: getReadablePaymentMethod(order.payment),
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          items: orderItems,
          orderSummary,
          city: order.city || undefined,
          orderLink,
          thanksParagraph,
          giftRecipientName: isGiftOrder(order)
            ? order.giftRecipientName
            : null,
        }) as React.ReactElement,
        text: `${subjectCustomer}\n\n${orderSummary}\n\nVer detalles: ${orderLink}\n\n${thanksParagraph}`,
      }) });
    }

    const outcomes = await deliverEmails(jobs, {
      storeId: order.storeId,
      orderId: order.id,
      kind,
      recordFailures: options?.recordFailures,
    });

    // Quien recibe el regalo sigue el paquete con el mismo aviso, sin precios.
    if (!options?.roles) await sendGiftNotification(order, shippingStatus);

    console.log(
      `[EMAIL] Shipping notification for order #${order.orderNumber} - ${shippingStatus}: ${Object.entries(outcomes).map(([role, outcome]) => `${role}=${outcome?.ok ? "ok" : "falló"}`).join(", ")}`,
    );
    return outcomes;
  } catch (error) {
    // Antes solo iba a console.error y no quedaba rastro de un aviso de envío perdido.
    console.error("[EMAIL] Error sending shipping email:", error);
    if (options?.recordFailures !== false) {
      for (const role of options?.roles ?? EMAIL_ROLES) {
        if (role === "customer" && !order.email) continue;
        await recordFailedNotification({ storeId: order.storeId, channel: "EMAIL", kind, recipient: role, orderId: order.id, error });
      }
    }
    return Object.fromEntries(
      (options?.roles ?? EMAIL_ROLES).map((role) => [
        role,
        { ok: false, attempts: 0, error: error instanceof Error ? error.message : String(error), retryable: true },
      ]),
    ) as Awaited<ReturnType<typeof deliverEmails>>;
  }
};
