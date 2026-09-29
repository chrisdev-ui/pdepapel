import { OrderType } from "@prisma/client";

import { round2 } from "@/lib/order-totals";

/**
 * Montos de tarjeta de regalo sin dependencias de servidor: lo importan
 * `lib/utils.ts`, `lib/bold.ts` y `lib/financial.ts`, que también llegan
 * al navegador. El módulo con el libro y los códigos (`lib/gift-cards.ts`)
 * usa `node:crypto` y nunca debe entrar en un componente de cliente.
 */

/**
 * Lo que va a la pasarela: el total menos lo que cubre la tarjeta. `total`
 * no cambia nunca por una tarjeta (es un medio de pago, no un descuento);
 * los cinco sitios que firman o comprueban montos leen esto, no `total`.
 */
export function getAmountDue(order: {
  total: number;
  giftCardAmount?: number | null;
}): number {
  const covered = Number(order.giftCardAmount ?? 0);
  return Math.max(0, round2(Number(order.total) - covered));
}

export function isGiftCardOrder(order: { type?: OrderType | null }): boolean {
  return order.type === OrderType.GIFT_CARD;
}
