import { OrderType } from "@prisma/client";

/**
 * Tipo del movimiento de kardex al descontar una venta. El punto de venta es
 * «Venta presencial» cobre como cobre (efectivo, transferencia o datáfono por
 * Bold); el resto es «Venta».
 */
export function saleMovementType(orderType: OrderType | null | undefined) {
  return orderType === OrderType.POINT_OF_SALE ? ("IN_PERSON_SALE" as const) : ("ORDER_PLACED" as const);
}
