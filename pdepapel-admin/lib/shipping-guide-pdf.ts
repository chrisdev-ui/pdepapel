import type { Prisma } from "@prisma/client";

/**
 * La guía de envío en PDF (base64, hasta cientos de KB por pedido) nunca viaja
 * dentro de un pedido: solo por `GET /orders/[orderId]/guide`, para la dueña.
 */
export const SHIPPING_WITHOUT_GUIDE_PDF = {
  omit: { guidePdfBase64: true },
} as const satisfies Prisma.ShippingDefaultArgs;
