import { OrderStatus, Prisma } from "@prisma/client";

import type { CapsuleReceipt } from "@/lib/capsule-receipt";
import { isPaidLike } from "@/lib/order-transitions";

import {
  PUBLIC_CATALOG_OPTION_VALUE_SELECT,
  PUBLIC_CATEGORY_SELECT,
  PUBLIC_COLOR_SELECT,
  PUBLIC_DESIGN_SELECT,
  PUBLIC_IMAGE_SELECT,
  PUBLIC_SIZE_SELECT,
} from "@/lib/public-catalog";

/**
 * Lo que la clienta ve de su propio pedido en la tienda en línea.
 *
 * `GET /orders/[orderId]` no pide sesión (la página del pedido y su sondeo de
 * pago la usan con el id como llave), así que la forma es un `select`
 * explícito: datos de entrega, totales, pago, envío y los productos con lo
 * justo para mostrarlos y volver a pedirlos. Nunca `token`, notas internas,
 * costos, utilidad ni la cédula. La dueña del panel recibe la fila completa.
 */

/** Producto dentro de una línea: lo que la tarjeta y «Volver a pedir» necesitan. */
export const CUSTOMER_ORDER_ITEM_PRODUCT_SELECT = {
  id: true,
  slug: true,
  name: true,
  price: true,
  stock: true,
  sku: true,
  isFeatured: true,
  isArchived: true,
  isKit: true,
  availableAt: true,
  createdAt: true,
  productGroupId: true,
  images: { select: PUBLIC_IMAGE_SELECT },
  category: { select: PUBLIC_CATEGORY_SELECT },
  color: { select: PUBLIC_COLOR_SELECT },
  size: { select: PUBLIC_SIZE_SELECT },
  design: { select: PUBLIC_DESIGN_SELECT },
  catalogOptionValues: { select: PUBLIC_CATALOG_OPTION_VALUE_SELECT },
} satisfies Prisma.ProductSelect;

/**
 * Un pedido visto por la cuenta de solo lectura en la API: el estado, las
 * líneas, los totales y el envío sin datos de quien recibe. Nada de contacto,
 * transacción, guía, enlace público, riesgo ni costos de la casa.
 */
export const VIEWER_ORDER_DETAIL_SELECT = {
  id: true,
  storeId: true,
  orderNumber: true,
  status: true,
  type: true,
  source: true,
  city: true,
  department: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
  subtotal: true,
  discount: true,
  discountType: true,
  couponDiscount: true,
  total: true,
  isGift: true,
  giftCardAmount: true,
  paymentPlan: true,
  depositAmount: true,
  orderItems: {
    orderBy: { createdAt: "asc" },
    select: { id: true, productId: true, quantity: true, name: true, sku: true, price: true, imageUrl: true, isCustom: true, brandName: true, isPreorder: true },
  },
  payment: { select: { id: true, method: true } },
  shipping: {
    select: { id: true, status: true, provider: true, carrierName: true, courier: true, deliveryDays: true, estimatedDeliveryDate: true, actualDeliveryDate: true, createdAt: true },
  },
} satisfies Prisma.OrderSelect;

export const CUSTOMER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  type: true,
  userId: true,
  guestId: true,
  /** Solo para calcular `createdByAdmin`; nunca se devuelve tal cual. */
  createdBy: true,
  createdAt: true,
  updatedAt: true,
  paidAt: true,
  fullName: true,
  phone: true,
  email: true,
  address: true,
  address2: true,
  neighborhood: true,
  city: true,
  department: true,
  addressReference: true,
  company: true,
  subtotal: true,
  discount: true,
  couponDiscount: true,
  total: true,
  // Regalo: solo la bandera, el nombre y el mensaje. El correo y el teléfono
  // de quien recibe son datos de un tercero y no salen por la ruta pública.
  isGift: true,
  giftRecipientName: true,
  giftMessage: true,
  // Tarjeta de regalo: cuánto cubrió (pedido que la usó) o qué tarjeta
  // compró este pedido (solo nombre, valor, últimos cuatro y si ya salió).
  giftCardAmount: true,
  // Preventa con anticipo: cuánto se pagó y cuánto falta (nunca quién lo anotó).
  paymentPlan: true,
  depositAmount: true,
  depositPaidAt: true,
  giftCardPurchase: {
    select: { recipientName: true, initialAmount: true, codeLast4: true, deliveredAt: true },
  },
  coupon: { select: { code: true } },
  payment: { select: { id: true, method: true, transactionId: true } },
  shipping: {
    select: {
      id: true,
      provider: true,
      status: true,
      courier: true,
      carrierName: true,
      productName: true,
      deliveryDays: true,
      cost: true,
      codFee: true,
      isCOD: true,
      trackingCode: true,
      trackingUrl: true,
      envioClickIdOrder: true,
      estimatedDeliveryDate: true,
      actualDeliveryDate: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  orderItems: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      quantity: true,
      name: true,
      sku: true,
      price: true,
      imageUrl: true,
      isCustom: true,
      product: { select: CUSTOMER_ORDER_ITEM_PRODUCT_SELECT },
    },
  },
} satisfies Prisma.OrderSelect;

export type CustomerOrderRecord = Prisma.OrderGetPayload<{
  select: typeof CUSTOMER_ORDER_SELECT;
}>;

/**
 * Respuesta pública del pedido: cambia el id de quien lo creó por una marca
 * booleana (la tienda solo necesita saber si lo creó el panel).
 */
export function toCustomerOrderResponse(order: CustomerOrderRecord, capsule: CapsuleReceipt | null = null, declinedAttempt = false) {
  const { createdBy, ...customerOrder } = order;
  return { ...customerOrder, createdByAdmin: Boolean(createdBy), capsule, ...receiptMeta(order.status, declinedAttempt) };
}

export type PaymentResult = "approved" | "declined" | "pending";

/**
 * Cómo terminó el pago, para el aviso de la tienda al volver de Bold o Wompi.
 * Sale del estado del pedido (no del id de la transacción, que el enlace del
 * recibo dejará de mostrar), así funciona igual con las dos pasarelas. Un
 * rechazo deja el pedido pendiente para reintentar: con `declinedAttempt`
 * sigue siendo un rechazo para el aviso.
 */
export function getPaymentResult(status: OrderStatus, declinedAttempt = false): PaymentResult {
  if (isPaidLike(status)) return "approved";
  if (status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED) return "declined";
  if (declinedAttempt && (status === OrderStatus.PENDING || status === OrderStatus.CREATED)) return "declined";
  return "pending";
}

/**
 * Campos del recibo que la tienda usa sin depender de datos de la clienta:
 * el resultado del pago y si la respuesta viene enmascarada.
 */
export function receiptMeta(status: OrderStatus, declinedAttempt = false) {
  return { paymentResult: getPaymentResult(status, declinedAttempt), masked: false };
}

/** «Ana María Pérez» → «Ana P.»; un solo nombre queda tal cual. */
export function maskPersonName(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toLocaleUpperCase("es-CO")}.`;
}

/** Solo los últimos cuatro dígitos: «•••• 1234». */
export function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

/** Primera letra y dominio: «a***@gmail.com». */
export function maskEmail(email: string | null | undefined): string {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at < 1 || at === value.length - 1) return "";
  return `${value.charAt(0)}***@${value.slice(at + 1)}`;
}

/**
 * Lo que recibe quien abre el recibo solo con el enlace (no es la clienta
 * con sesión dueña ni el panel): nombres, teléfono y correo recortados,
 * dirección solo con ciudad y departamento, sin empresa, sin mensaje de regalo
 * ni transacción. Guía, estado, productos, totales y fechas siguen. La forma
 * es la del fixture de la tienda (pdepapel-store/tests/fixtures/receipt-orders.ts).
 */
export function maskOrderForLinkHolder(order: ReturnType<typeof toCustomerOrderResponse>) {
  const {
    address: _address,
    address2: _address2,
    neighborhood: _neighborhood,
    addressReference: _addressReference,
    company: _company,
    giftMessage: _giftMessage,
    payment,
    giftCardPurchase,
    ...kept
  } = order;
  return {
    ...kept,
    fullName: maskPersonName(order.fullName),
    phone: maskPhone(order.phone),
    email: maskEmail(order.email),
    giftRecipientName: order.giftRecipientName ? maskPersonName(order.giftRecipientName) : order.giftRecipientName,
    giftCardPurchase: giftCardPurchase
      ? { ...giftCardPurchase, recipientName: giftCardPurchase.recipientName ? maskPersonName(giftCardPurchase.recipientName) : giftCardPurchase.recipientName }
      : giftCardPurchase,
    payment: payment ? { id: payment.id, method: payment.method } : payment,
    masked: true,
  };
}

/** La clienta con sesión dueña del pedido; cualquier otra persona con el enlace recibe el recibo recortado. */
export function isOrderOwnerSession(order: { userId: string | null }, sessionUserId: string | null) {
  return Boolean(sessionUserId && order.userId && order.userId === sessionUserId);
}

/** Campos de `Order` que nunca deben salir por una ruta pública (para pruebas). */
export const INTERNAL_ORDER_FIELDS = [
  "token",
  "adminNotes",
  "internalNotes",
  "documentId",
  "totalProductCost",
  "gatewayFee",
  "shippingCost",
  "netProfit",
  "profitMarginPct",
  "productShippingCost",
  "productShippingMissing",
  "createdBy",
  "analyticsClientId",
  "analyticsSessionId",
  "analyticsConsent",
  "idempotencyKey",
  "giftRecipientEmail",
  "giftRecipientPhone",
  "giftCardId",
  "legalTermsVersion",
  "legalPrivacyVersion",
  "legalConsentAt",
  "legalConsentChannel",
  "whatsappOptInAt",
  "whatsappOptInVersion",
  "whatsappOptInSource",
  "whatsappOptInBy",
  "whatsappOptOutAt",
  "providerMessageId",
] as const;

/** Lista «Mis pedidos» de la tienda: lo que pintan el historial y el resumen de la cuenta. */
export const CUSTOMER_ORDER_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  type: true,
  createdAt: true,
  total: true,
  payment: { select: { method: true } },
  shipping: {
    select: {
      status: true,
      provider: true,
      carrierName: true,
      courier: true,
      trackingCode: true,
      trackingUrl: true,
      actualDeliveryDate: true,
    },
  },
  orderItems: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      quantity: true,
      imageUrl: true,
      product: {
        select: {
          images: {
            select: { url: true, isMain: true },
            orderBy: { isMain: "desc" },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

export const ORDER_LIST_DEFAULT_LIMIT = 200;
export const ORDER_LIST_MAX_LIMIT = 200;

/** `?pagina=` (desde 1) y `?limite=` de la lista; valores raros caen al defecto. */
export function parseOrderListPage(params: URLSearchParams) {
  const page = Number.parseInt(params.get("pagina") ?? "", 10);
  const limit = Number.parseInt(params.get("limite") ?? "", 10);
  const take =
    Number.isFinite(limit) && limit > 0
      ? Math.min(limit, ORDER_LIST_MAX_LIMIT)
      : ORDER_LIST_DEFAULT_LIMIT;
  const skip = Number.isFinite(page) && page > 1 ? (page - 1) * take : 0;
  return { take, skip };
}

/**
 * Quién puede ver un pedido sin ser la dueña. El id del pedido es la llave de
 * los pedidos de invitada y de los que la dueña registra desde el panel; el
 * de una clienta con cuenta solo se abre con su sesión.
 */
export function canCustomerViewOrder(
  order: { userId: string | null; createdBy: string | null },
  sessionUserId: string | null,
) {
  if (!order.userId || order.createdBy) return true;
  return order.userId === sessionUserId;
}

/** Lo que el rastreo de un envío devuelve: estado, transportadora, guía y fechas. */
export const TRACKING_SHIPPING_SELECT = {
  id: true,
  status: true,
  provider: true,
  carrierName: true,
  courier: true,
  trackingCode: true,
  trackingUrl: true,
  estimatedDeliveryDate: true,
  actualDeliveryDate: true,
  updatedAt: true,
} satisfies Prisma.ShippingSelect;

export const TRACKING_EVENT_SELECT = {
  id: true,
  shippingId: true,
  status: true,
  description: true,
  location: true,
  timestamp: true,
  createdAt: true,
} satisfies Prisma.ShippingTrackingEventSelect;
