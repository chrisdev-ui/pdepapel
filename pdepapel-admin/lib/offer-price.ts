import { DiscountType } from "@prisma/client";

/** Precio final con el mismo redondeo de la tienda (`lib/discount-engine.ts`). Aparte de
 * `lib/offer-scope.ts`, que consulta la base, porque el formulario de ofertas lo usa en el navegador. */
export function priceAfter(type: DiscountType | undefined, amount: number | undefined, price: number): number {
  if (!type || !amount || amount <= 0) return price;
  if (type === DiscountType.PERCENTAGE) return Math.max(0, Math.round(price * (1 - amount / 100)));
  return Math.max(0, price - amount);
}
