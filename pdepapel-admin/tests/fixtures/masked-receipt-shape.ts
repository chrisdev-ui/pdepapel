/**
 * Copia de la forma de `maskedReceiptOrder` en
 * pdepapel-store/tests/fixtures/receipt-orders.ts (44508376): lo que la tienda
 * sabe pintar cuando el recibo llega recortado. Si cambia allá, cambia aquí
 * (la prueba de contrato también lee ese archivo para avisar).
 */
export type ShapeType = "string" | "number" | "boolean" | "array" | "object" | "string|null";

export const MASKED_RECEIPT_SHAPE = {
  order: {
    id: "string",
    orderNumber: "string",
    userId: "string|null",
    guestId: "string|null",
    status: "string",
    type: "string",
    fullName: "string",
    phone: "string",
    email: "string",
    city: "string",
    department: "string",
    orderItems: "array",
    payment: "object",
    shipping: "object",
    subtotal: "number",
    total: "number",
    isGift: "boolean",
    giftRecipientName: "string",
    createdAt: "string",
    paidAt: "string|null",
    paymentResult: "string",
    masked: "boolean",
  } satisfies Record<string, ShapeType>,
  payment: { id: "string", method: "string" } satisfies Record<string, ShapeType>,
  shipping: {
    id: "string",
    provider: "string",
    status: "string",
    carrierName: "string",
    trackingCode: "string",
    trackingUrl: "string",
  } satisfies Record<string, ShapeType>,
  /** Lo que el fixture de la tienda quita del recibo completo. */
  removed: ["address", "address2", "neighborhood", "addressReference", "company", "giftMessage"],
  removedFromPayment: ["transactionId"],
  /** Las formas recortadas: «Ana M.», «•••• 0000», «a***@prueba.test». */
  patterns: {
    fullName: /^\S+( [A-ZÁÉÍÓÚÑÜ]\.)?$/,
    giftRecipientName: /^\S+( [A-ZÁÉÍÓÚÑÜ]\.)?$/,
    phone: /^•••• \d{4}$/,
    email: /^.\*\*\*@[^@\s]+$/,
  },
} as const;
