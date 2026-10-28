import type { Prisma } from "@prisma/client";

/**
 * Regla 5 de la preventa (ver `lib/presale.ts`): si un pedido trae una línea de
 * preventa sin liberar, no se despacha NADA de ese pedido. Puro, sin Prisma
 * Client, para que las colas de Pedidos lo usen también en el navegador.
 */
export const UNRELEASED_PRESALE_LINE = {
  isPreorder: true,
  preorderReleasedAt: null,
} satisfies Prisma.OrderItemWhereInput;

/** Pedidos con al menos una línea de preventa sin liberar. Basta UNA para frenar el pedido completo. */
export const ORDER_HAS_UNRELEASED_PRESALE: Prisma.OrderWhereInput = {
  orderItems: { some: UNRELEASED_PRESALE_LINE },
};

/** Lo que va en cualquier consulta de «listo para despachar». */
export const ORDER_READY_TO_DISPATCH: Prisma.OrderWhereInput = {
  NOT: ORDER_HAS_UNRELEASED_PRESALE,
};

/** ¿Este pedido, ya cargado con sus líneas, está frenado por una preventa? */
export function isOrderHeldByPresale(order: {
  orderItems: { isPreorder: boolean; preorderReleasedAt: Date | null }[];
}): boolean {
  return order.orderItems.some((item) => item.isPreorder && item.preorderReleasedAt === null);
}

export const PRESALE_HOLD_GUIDE_MESSAGE =
  "Este pedido espera la mercancía de una preventa: la guía se crea cuando liberes la preventa.";
