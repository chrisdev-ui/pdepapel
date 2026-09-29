/** Selección de una tarjeta para el panel: nunca el hash del código. */
export const GIFT_CARD_ADMIN_SELECT = {
  id: true,
  codeLast4: true,
  initialAmount: true,
  balance: true,
  status: true,
  purchaseOrderId: true,
  buyerEmail: true,
  recipientName: true,
  recipientEmail: true,
  message: true,
  issuedAt: true,
  deliveredAt: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
  purchaseOrder: {
    select: { id: true, orderNumber: true, fullName: true, status: true, paidAt: true },
  },
} as const;
