import { Prisma } from "@prisma/client";

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

export const CUSTOMER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
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
export function toCustomerOrderResponse(order: CustomerOrderRecord) {
  const { createdBy, ...customerOrder } = order;
  return { ...customerOrder, createdByAdmin: Boolean(createdBy) };
}

/**
 * Cotización pública (`GET /public/custom-orders/[token]`): lo que la página
 * de pago necesita para prellenar datos y listar los ítems. El token es la
 * llave, así que la tienda se comprueba en la misma consulta.
 */
export const PUBLIC_QUOTATION_SELECT = {
  id: true,
  storeId: true,
  orderNumber: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  fullName: true,
  phone: true,
  email: true,
  address: true,
  address2: true,
  neighborhood: true,
  city: true,
  department: true,
  daneCode: true,
  addressReference: true,
  company: true,
  subtotal: true,
  discount: true,
  couponDiscount: true,
  total: true,
  /** Descripción de la cotización que la clienta sí debe ver. */
  adminNotes: true,
  shipping: {
    select: {
      id: true,
      envioClickIdRate: true,
      carrierName: true,
      cost: true,
      status: true,
      provider: true,
    },
  },
  orderItems: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      productId: true,
      quantity: true,
      name: true,
      price: true,
      imageUrl: true,
      isCustom: true,
      product: {
        select: {
          id: true,
          name: true,
          description: true,
          images: { select: PUBLIC_IMAGE_SELECT },
          price: true,
          sku: true,
          size: { select: { name: true } },
          color: { select: { name: true } },
          design: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.OrderSelect;

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
  "createdBy",
  "analyticsClientId",
  "idempotencyKey",
] as const;
