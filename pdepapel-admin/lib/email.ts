import {
  Order,
  OrderStatus,
  OrderAccountClaimSource,
  PaymentMethod,
  Prisma,
  type PrismaClient,
  ShippingStatus,
  OrderType,
} from "@prisma/client";
import { GiftCardReview } from "@prisma/client";
import type { EmailLineItem, EmailSummaryLine } from "@/emails/components";
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
import { RISK_REASON_LABELS, isFlagged, parseRiskReasons } from "@/lib/order-risk";
import { getShippingChargeState } from "@/lib/order-totals";
import { isPlaceholderEmail } from "@/lib/placeholder-emails";
import prismadb from "@/lib/prismadb";

/**
 * Lo que necesita un correo de pedido, en UNA sola consulta.
 *
 * Antes cada llamada armaba su propio pedido y lo pasaba entero; el cambio de
 * estado desde el panel (PATCH /orders/[orderId]) pedía solo id, número,
 * estado, correo y nombre, y todos los «Pago confirmado» salían con «Sin
 * artículos registrados.», sin total, sin ciudad (incidente del 2026-10-07).
 * Ahora quien llama manda el id y el correo se arma siempre con esto.
 */
export const ORDER_EMAIL_INCLUDE = {
  payment: { select: { method: true } },
  shipping: true,
  orderItems: {
    include: { product: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.OrderInclude;

type LoadedOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_EMAIL_INCLUDE }>;

/** El pedido listo para el correo: el medio de pago ya como `PaymentMethod`. */
export type EmailOrder = Omit<LoadedOrder, "payment"> & {
  payment: PaymentMethod | null;
};

export async function loadOrderForEmail(
  orderId: string,
  db: Pick<PrismaClient, "order"> = prismadb,
): Promise<EmailOrder | null> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: ORDER_EMAIL_INCLUDE,
  });
  if (!order) return null;
  return { ...order, payment: order.payment?.method ?? null };
}

/**
 * Lo que sabe quien llama y la base todavía no: el checkout manda al correo de
 * la sesión de Clerk cuando el formulario no trae uno, y el pedido pagado del
 * todo con tarjeta de regalo se anuncia con ese medio aunque el registro de
 * pago conserve el elegido al principio.
 */
export interface OrderEmailOverrides {
  customerEmail?: string | null;
  paymentMethod?: PaymentMethod | null;
}

function applyOverrides(order: EmailOrder, overrides: OrderEmailOverrides = {}): EmailOrder {
  return {
    ...order,
    email: overrides.customerEmail || order.email,
    payment: overrides.paymentMethod ?? order.payment,
  };
}

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
function getOrderLineItems(order: EmailOrder): EmailLineItem[] {
  return order.orderItems.map((item) => {
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
function getOrderSummary(order: EmailOrder) {
  const lines = getOrderLineItems(order).map(
    (item) =>
      `• ${item.name} x${item.quantity}${item.price ? ` — ${item.price}` : ""}`,
  );
  const summary = getOrderTotalsSummary(order).map(
    (line) => `${line.label}: ${line.value}`,
  );
  return [
    ...lines,
    ...summary,
    ...(order.total ? [`Total: ${currencyFormatter(order.total)}`] : []),
  ].join("\n");
}

/**
 * Las líneas entre los artículos y el total, para que el total cuadre a la
 * vista: subtotal, descuento, cupón y envío. Solo las que aplican; sin
 * ninguna, el total ya es la suma de los artículos y no se repite.
 *
 * El envío dice «Gratis» solo si hubo cotización y salió en cero (envío
 * gratis por monto); sin cotización no se dice nada, para no prometer.
 */
export function getOrderTotalsSummary(order: EmailOrder): EmailSummaryLine[] {
  const adjustments: EmailSummaryLine[] = [];
  if (order.discount > 0) {
    adjustments.push({ label: "Descuento", value: `−${currencyFormatter(order.discount)}` });
  }
  if (order.couponDiscount > 0) {
    adjustments.push({ label: "Cupón", value: `−${currencyFormatter(order.couponDiscount)}` });
  }
  if (order.shipping) {
    const state = getShippingChargeState({
      shippingCost: order.shipping.cost,
      subtotal: order.subtotal,
      hasQuote: order.shipping.envioClickIdRate != null,
    });
    if (state === "charged") {
      adjustments.push({ label: "Envío", value: currencyFormatter(order.shipping.cost ?? 0) });
    } else if (state === "free") {
      adjustments.push({ label: "Envío", value: "Gratis" });
    }
  }
  if (adjustments.length === 0) return [];
  return [{ label: "Subtotal", value: currencyFormatter(order.subtotal) }, ...adjustments];
}

function getOrderLink(orderId: string) {
  // Adjust this URL to your frontend order details page
  return `https://papeleriapdepapel.com/pedido/${orderId}`;
}

async function getOrderAccountClaimEmailLink(order: Order) {
  if (
    !order.email ||
    isPlaceholderEmail(order.email) ||
    order.userId ||
    order.type !== OrderType.STANDARD
  ) {
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

/**
 * El aviso a quien recibe un regalo: sin productos, precios, totales ni
 * enlace del pedido. Solo cuando el pedido es regalo, dejó un correo y ese
 * correo no es el de quien compra (que ya recibe el recibo completo).
 *
 * Nunca en PENDING: un regalo no se anuncia antes de que el pago exista.
 * Un fallo aquí no tumba el correo de la clienta: se registra aparte.
 */
async function sendGiftNotification(
  order: EmailOrder,
  status: OrderStatus | ShippingStatus,
) {
  const recipient = getGiftNotificationEmail(order);
  if (!recipient) return;
  if (isPlaceholderEmail(recipient)) {
    console.info(`[EMAIL] gift:${status} pedido #${order.orderNumber}: correo de relleno, no se avisa el regalo`);
    return;
  }

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

/**
 * A quién va el correo de la clienta: su dirección, o nadie si no dejó una o
 * es de relleno (lib/placeholder-emails.ts). El de relleno se anota como
 * información, no como fallo: no hay nada que reintentar.
 */
function customerRecipient(order: EmailOrder, kind: string): string | null {
  if (!order.email) return null;
  if (isPlaceholderEmail(order.email)) {
    console.info(`[EMAIL] ${kind} pedido #${order.orderNumber}: correo de relleno, no se manda a la clienta`);
    return null;
  }
  return order.email;
}

const SHIPPING_STATUSES: ShippingStatus[] = [
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

const FROM = "Papelería P de Papel <orders@papeleriapdepapel.com>";

/** Un correo armado, sin destinatario: lo que se manda o se pinta. */
export interface BuiltEmail {
  subject: string;
  react: React.ReactElement;
  text: string;
}

/**
 * Arma los dos correos de un cambio de estado del pedido, sin mandarlos.
 *
 * Aparte del envío para poder pintarlos (pruebas, revisión local de un pedido
 * real) sin tocar Resend ni escribir en la base: el enlace para guardar el
 * pedido en la cuenta lo pasa quien llama, porque crearlo escribe.
 */
export function buildOrderEmails(
  order: EmailOrder,
  status: OrderStatus,
  options: { accountClaimLink?: string | null } = {},
): { admin: BuiltEmail; customer: BuiltEmail | null } {
  const readableStatus = getReadableStatus(status);
  const readablePayment = getReadablePaymentMethod(order.payment);
  // Compra de tarjeta de regalo: no se empaca ni se envía; el código sale
  // en otro correo (lib/gift-card-delivery.ts).
  const digital = order.type === OrderType.GIFT_CARD;
  const items = getOrderLineItems(order);
  const summary = getOrderTotalsSummary(order);
  const total = order.total ? currencyFormatter(order.total) : undefined;
  const orderSummary = getOrderSummary(order);
  const orderLink = getOrderLink(order.id);
  const accountClaimLink = options.accountClaimLink ?? null;
  const giftRecipientName =
    isGiftOrder(order) && !digital ? order.giftRecipientName : null;
  const notificationSource = getOrderNotificationSource(status);

  const giftCardTarget = order.giftRecipientEmail
    ? `al correo de ${order.giftRecipientName || "quien la recibe"}`
    : "a tu correo";
  const giftCardHeld = digital && order.giftCardReview === GiftCardReview.PENDING;
  const flagged = isFlagged(order);
  const riskNote = flagged
    ? parseRiskReasons(order.riskReasons).map((reason) => RISK_REASON_LABELS[reason]).join(" · ") || "Varias señales"
    : null;
  const thanksParagraph = digital
    ? status === OrderStatus.PAID && giftCardHeld
      ? `¡Gracias! Recibimos tu pago. Estamos verificando la compra y el código sale ${giftCardTarget} en cuanto terminemos, normalmente el mismo día.`
      : status === OrderStatus.PAID
      ? `¡Gracias! El código de la tarjeta de regalo ya salió ${giftCardTarget}, en un correo aparte.`
      : "Recibimos tu compra de la tarjeta de regalo. En cuanto el pago se confirme, el código sale por correo."
    : status === OrderStatus.PAID
      ? "¡Gracias por tu compra! Estamos procesando tu pedido y te notificaremos cuando sea enviado."
      : "Gracias por confiar en nosotros. Si tienes dudas, responde al correo papeleria.pdepapel@gmail.com o contáctanos por WhatsApp.";

  const admin: BuiltEmail = {
    subject: `${flagged ? "⚠️ Posible bot · " : ""}[Admin] Pedido #${order.orderNumber} - ${readableStatus}${giftCardHeld ? " · Tarjeta en revisión" : ""}`,
    react: OrderNotification({
      name: order.fullName,
      orderNumber: order.orderNumber,
      status,
      isAdminEmail: true,
      riskNote,
      giftCardHeld,
      paymentMethod: readablePayment,
      city: order.city || undefined,
      trackingInfo: order.shipping?.trackingCode ?? undefined,
      email: order.email || undefined,
      total,
      address: order.address,
      phone: order.phone,
      items,
      summary,
      orderSummary,
      orderLink,
      thanksParagraph,
      notificationSource,
      giftRecipientName,
      digital,
    }) as React.ReactElement,
    text: `${riskNote ? `⚠️ Posible bot: ${riskNote}\n` : ""}${giftCardHeld ? "Tarjeta en revisión: apruébala o recházala en el pedido.\n" : ""}Pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\nOrigen del aviso: ${notificationSource}\n\n${orderSummary}\n\nVer detalles: ${orderLink}`,
  };

  const customer: BuiltEmail | null = order.email
    ? {
        subject: `Tu pedido #${order.orderNumber} - ${readableStatus}`,
        react: OrderNotification({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status,
          paymentMethod: readablePayment,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          total,
          items,
          summary,
          orderSummary,
          city: order.city || undefined,
          orderLink,
          thanksParagraph,
          accountClaimLink,
          giftRecipientName,
          digital,
        }) as React.ReactElement,
        text: `Tu pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\n\n${orderSummary}\n\nVer detalles: ${orderLink}${accountClaimLink ? `\n\nGuarda este pedido en tu cuenta: ${accountClaimLink}` : ""}\n\n${thanksParagraph}`,
      }
    : null;

  return { admin, customer };
}

type DeliveryOutcomes = Awaited<ReturnType<typeof deliverEmails>>;

function failedOutcomes(roles: readonly EmailRole[], error: unknown): DeliveryOutcomes {
  return Object.fromEntries(
    roles.map((role) => [
      role,
      { ok: false, attempts: 0, error: error instanceof Error ? error.message : String(error), retryable: true },
    ]),
  ) as DeliveryOutcomes;
}

/**
 * Avisa un cambio de estado del pedido a la clienta y al admin.
 *
 * Recibe el id, no el pedido: lo carga aquí con `ORDER_EMAIL_INCLUDE`, así
 * ninguna llamada puede volver a mandar un correo sin artículos ni totales.
 */
export const sendOrderEmail = async (
  orderId: string,
  status: OrderStatus | ShippingStatus,
  options?: OrderEmailOverrides & {
    notifyAdmin?: boolean;
    /** Solo estos destinatarios (el barrido de reintentos manda uno a la vez). */
    roles?: EmailRole[];
    /** false: quien llama registra los fallos (el barrido cuenta intentos). */
    recordFailures?: boolean;
    /**
     * false: sin enlace para guardar el pedido en la cuenta (y sin crear su
     * `OrderAccountClaim`). El cambio de estado desde el panel nunca lo creó
     * y sigue sin crearlo; el checkout y los webhooks sí.
     */
    accountClaim?: boolean;
  },
): Promise<DeliveryOutcomes | undefined> => {
  const kind = `order:${status}`;
  const roles = options?.roles ?? EMAIL_ROLES;
  let order: EmailOrder | null = null;
  try {
    // SKIP email sending in development environment
    if (env.NODE_ENV === "development") {
      console.log(`[EMAIL] Skipping email in development for order ${orderId} - ${status}`);
      return;
    }

    // Los avisos de envío los manda solo el webhook de EnvioClick.
    if (SHIPPING_STATUSES.includes(status as ShippingStatus)) {
      console.log(`[EMAIL] Skipping email for shipping status ${status} - handled by webhook`);
      return;
    }

    const loaded = await loadOrderForEmail(orderId);
    if (!loaded) {
      console.error(`[EMAIL] Order ${orderId} not found; no email for ${status}`);
      return;
    }
    order = applyOverrides(loaded, options);

    const accountClaimLink =
      status === OrderStatus.PENDING &&
      roles.includes("customer") &&
      options?.accountClaim !== false
        ? await getOrderAccountClaimEmailLink(order)
        : null;
    const built = buildOrderEmails(order, status as OrderStatus, { accountClaimLink });

    // Cada destinatario por su lado (lib/email-delivery.ts): si falla el del
    // admin, el de la clienta sale igual, y cada fallo queda registrado.
    const wanted = new Set<EmailRole>(roles);
    const jobs: EmailJob[] = [];
    if (options?.notifyAdmin !== false && wanted.has("admin")) {
      jobs.push({ role: "admin", send: () => resend.emails.send({ from: FROM, to: ADMIN_EMAIL_RECIPIENTS, ...built.admin }) });
    }
    const customer = built.customer;
    const to = wanted.has("customer") ? customerRecipient(order, kind) : null;
    if (customer && to) {
      jobs.push({ role: "customer", send: () => resend.emails.send({ from: FROM, to: [to], ...customer }) });
    }

    const outcomes = await deliverEmails(jobs, {
      storeId: order.storeId,
      orderId: order.id,
      kind,
      recordFailures: options?.recordFailures,
    });

    // El regalo se anuncia a quien recibe solo con el pago confirmado. Una
    // tarjeta de regalo tiene su propio correo con el código: no se avisa dos veces.
    if (status === OrderStatus.PAID && order.type !== OrderType.GIFT_CARD && !options?.roles) {
      await sendGiftNotification(order, status);
    }
    return outcomes;
  } catch (error) {
    // Algo falló antes de mandar (leer la base, armar el correo): no salió
    // ninguno de los dos.
    console.error("Error sending email:", error);
    if (options?.recordFailures !== false) {
      for (const role of roles) {
        if (role === "admin" && options?.notifyAdmin === false) continue;
        if (role === "customer" && order && (!order.email || isPlaceholderEmail(order.email))) continue;
        await recordFailedNotification({
          storeId: order?.storeId ?? null,
          channel: "EMAIL",
          kind,
          recipient: role,
          orderId,
          error,
        });
      }
    }
    return failedOutcomes(roles, error);
  }
};

const SHIPPING_COPY: Partial<Record<ShippingStatus, { thanks: string; subject?: (orderNumber: string) => string }>> = {
  [ShippingStatus.Shipped]: {
    thanks: "Tu pedido ha sido recogido por la transportadora y está en camino. Te notificaremos cuando esté cerca de ser entregado.",
  },
  [ShippingStatus.PickedUp]: {
    thanks: "Tu pedido ha sido recogido por la transportadora y está en camino. Te notificaremos cuando esté cerca de ser entregado.",
  },
  [ShippingStatus.InTransit]: {
    thanks: "Tu pedido está en tránsito hacia tu ubicación. Pronto recibirás una notificación cuando esté listo para entrega.",
  },
  [ShippingStatus.OutForDelivery]: {
    thanks: "¡Tu pedido está en camino! Será entregado hoy. Por favor asegúrate de estar disponible para recibirlo.",
    subject: (n) => `¡Tu pedido #${n} está en camino!`,
  },
  [ShippingStatus.Delivered]: {
    thanks: "¡Esperamos que disfrutes tu compra! Si tienes algún problema con tu pedido, por favor contáctanos.",
    subject: (n) => `¡Tu pedido #${n} ha sido entregado!`,
  },
  [ShippingStatus.FailedDelivery]: {
    thanks: "No pudimos entregar tu pedido. Por favor contáctanos para coordinar una nueva entrega.",
  },
  [ShippingStatus.Returned]: {
    thanks: "Tu pedido ha sido devuelto. Por favor contáctanos para más información.",
  },
};

const SHIPPING_SOURCE = "Actualización de envío recibida desde EnvíoClick.";

/** Arma los dos avisos de un cambio de envío, sin mandarlos. */
export function buildShippingEmails(
  order: EmailOrder,
  shippingStatus: ShippingStatus,
): { admin: BuiltEmail; customer: BuiltEmail | null } {
  const readableStatus = getReadableStatus(shippingStatus);
  const items = getOrderLineItems(order);
  const summary = getOrderTotalsSummary(order);
  const total = order.total ? currencyFormatter(order.total) : undefined;
  const orderSummary = getOrderSummary(order);
  const orderLink = getOrderLink(order.id);
  const copy = SHIPPING_COPY[shippingStatus];
  const thanksParagraph = copy?.thanks ?? "Gracias por confiar en nosotros.";
  const subjectCustomer = copy?.subject?.(order.orderNumber) ?? `Tu pedido #${order.orderNumber} - ${readableStatus}`;
  const giftRecipientName = isGiftOrder(order) ? order.giftRecipientName : null;
  const paymentMethod = getReadablePaymentMethod(order.payment);

  const admin: BuiltEmail = {
    subject: `[Admin] Pedido #${order.orderNumber} - ${readableStatus}`,
    react: OrderNotification({
      name: order.fullName,
      orderNumber: order.orderNumber,
      status: shippingStatus,
      isAdminEmail: true,
      paymentMethod,
      trackingInfo: order.shipping?.trackingCode ?? undefined,
      email: order.email || undefined,
      total,
      address: order.address,
      city: order.city || undefined,
      phone: order.phone,
      items,
      summary,
      orderSummary,
      orderLink,
      thanksParagraph,
      notificationSource: SHIPPING_SOURCE,
      giftRecipientName,
    }) as React.ReactElement,
    text: `Pedido #${order.orderNumber} - ${readableStatus} para ${order.fullName}\nOrigen del aviso: ${SHIPPING_SOURCE}\n\n${orderSummary}\n\nVer detalles: ${orderLink}`,
  };

  const customer: BuiltEmail | null = order.email
    ? {
        subject: subjectCustomer,
        react: OrderNotification({
          name: order.fullName,
          orderNumber: order.orderNumber,
          status: shippingStatus,
          paymentMethod,
          trackingInfo: order.shipping?.trackingCode ?? undefined,
          total,
          items,
          summary,
          orderSummary,
          city: order.city || undefined,
          orderLink,
          thanksParagraph,
          giftRecipientName,
        }) as React.ReactElement,
        text: `${subjectCustomer}\n\n${orderSummary}\n\nVer detalles: ${orderLink}\n\n${thanksParagraph}`,
      }
    : null;

  return { admin, customer };
}

/**
 * Envía email de notificación de envío/entrega
 * SOLO debe ser llamada desde el webhook de EnvioClick para evitar duplicados.
 * Como `sendOrderEmail`, recibe el id y carga el pedido completo.
 */
export const sendShippingEmail = async (
  orderId: string,
  shippingStatus: ShippingStatus,
  options?: { roles?: EmailRole[]; recordFailures?: boolean },
): Promise<DeliveryOutcomes | undefined> => {
  const kind = `shipping:${shippingStatus}`;
  const roles = options?.roles ?? EMAIL_ROLES;
  let order: EmailOrder | null = null;
  try {
    // SKIP email sending in development environment
    if (env.NODE_ENV === "development") {
      console.log(`[EMAIL] Skipping shipping email in development for order ${orderId} - ${shippingStatus}`);
      return;
    }

    order = await loadOrderForEmail(orderId);
    if (!order) {
      console.error(`[EMAIL] Order ${orderId} not found; no shipping email for ${shippingStatus}`);
      return;
    }
    const built = buildShippingEmails(order, shippingStatus);

    const wanted = new Set<EmailRole>(roles);
    const jobs: EmailJob[] = [];
    if (wanted.has("admin")) {
      jobs.push({ role: "admin", send: () => resend.emails.send({ from: FROM, to: ADMIN_EMAIL_RECIPIENTS, ...built.admin }) });
    }
    const customer = built.customer;
    const to = wanted.has("customer") ? customerRecipient(order, kind) : null;
    if (customer && to) {
      jobs.push({ role: "customer", send: () => resend.emails.send({ from: FROM, to: [to], ...customer }) });
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
      for (const role of roles) {
        if (role === "customer" && order && (!order.email || isPlaceholderEmail(order.email))) continue;
        await recordFailedNotification({ storeId: order?.storeId ?? null, channel: "EMAIL", kind, recipient: role, orderId, error });
      }
    }
    return failedOutcomes(roles, error);
  }
};
