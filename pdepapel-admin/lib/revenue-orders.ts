import { OrderStatus, OrderType, Prisma } from "@prisma/client";

/**
 * Qué pedidos cuentan como ingreso.
 *
 * Hasta 2026-09 cada reporte repetía «status PAID o SENT» a mano. Las
 * tarjetas de regalo obligan a una regla más: la compra de una tarjeta
 * (`OrderType.GIFT_CARD`) NO es ingreso, es un pasivo; el ingreso se
 * reconoce cuando la tarjeta se usa, y ese pedido cuenta por su `total`
 * completo (la tarjeta es un medio de pago, no un descuento).
 *
 * Todo reporte que sume `Order.total` pasa por aquí; la prueba de
 * integración `gift-card-revenue-exclusion` crea un pedido GIFT_CARD y
 * comprueba, sitio por sitio, que no aparece.
 */

/** Estados que significan «vendido». */
export const REVENUE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.SENT,
];

/** Tipos de pedido que nunca son ingreso. */
export const NON_REVENUE_ORDER_TYPES: OrderType[] = [OrderType.GIFT_CARD];

/**
 * Fragmento `where` para Prisma. Se combina con el resto de condiciones del
 * reporte (`{ storeId, ...revenueOrderWhere(), createdAt: {...} }`).
 */
export function revenueOrderWhere(): Pick<Prisma.OrderWhereInput, "status" | "type"> {
  return {
    status: { in: REVENUE_ORDER_STATUSES },
    type: { notIn: NON_REVENUE_ORDER_TYPES },
  };
}

/** La misma regla, para filtrar en memoria filas ya cargadas. */
export function isRevenueOrder(order: { status: OrderStatus; type: OrderType }): boolean {
  return (
    REVENUE_ORDER_STATUSES.includes(order.status) &&
    !NON_REVENUE_ORDER_TYPES.includes(order.type)
  );
}

/** Fragmento SQL para los reportes que consultan con `$queryRaw`. */
export const REVENUE_ORDER_SQL = Prisma.sql`\`Order\`.\`status\` IN ('PAID', 'SENT') AND \`Order\`.\`type\` <> 'GIFT_CARD'`;
