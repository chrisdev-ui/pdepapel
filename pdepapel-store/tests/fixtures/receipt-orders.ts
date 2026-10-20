import type { Order } from "@/types";

/**
 * Las dos formas del recibo que entrega `GET /orders/[id]`: la completa (la
 * clienta con su sesión, la dueña) y la recortada para quien solo tiene el
 * enlace. Las pruebas de la administración que activan el recorte deben
 * producir exactamente `maskedReceiptOrder`.
 */
export const fullReceiptOrder = (overrides: Partial<Order> = {}): Order =>
  ({
    id: "order-1",
    orderNumber: "ORD-1",
    userId: null,
    guestId: "guest-1",
    status: "PAID",
    type: "STANDARD",
    fullName: "Ana María Prueba",
    phone: "+573000000000",
    email: "ana@prueba.test",
    address: "Calle Prueba 1",
    address2: "Apto 2",
    neighborhood: "Centro",
    addressReference: "Portería azul",
    company: "Empresa Prueba",
    city: "Medellín",
    department: "Antioquia",
    orderItems: [],
    payment: { id: "pay-1", method: "Bold", transactionId: "TX-PRUEBA-1" },
    shipping: {
      id: "ship-1",
      provider: "ENVIOCLICK",
      status: "InTransit",
      carrierName: "Coordinadora",
      trackingCode: "GUIA-PRUEBA-1",
      trackingUrl: "https://example.test/rastreo",
    },
    subtotal: 50000,
    total: 60000,
    isGift: true,
    giftRecipientName: "Lucía Prueba",
    giftMessage: "Mensaje de prueba",
    createdAt: "2026-10-19T12:00:00.000Z",
    paidAt: "2026-10-19T12:05:00.000Z",
    paymentResult: "approved",
    masked: false,
    ...overrides,
  }) as Order;

export const maskedReceiptOrder = (overrides: Partial<Order> = {}): Order => {
  const {
    address: _address,
    address2: _address2,
    neighborhood: _neighborhood,
    addressReference: _addressReference,
    company: _company,
    giftMessage: _giftMessage,
    ...kept
  } = fullReceiptOrder();
  return {
    ...kept,
    fullName: "Ana M.",
    phone: "•••• 0000",
    email: "a***@prueba.test",
    giftRecipientName: "Lucía P.",
    payment: { id: "pay-1", method: "Bold" },
    masked: true,
    ...overrides,
  } as Order;
};
