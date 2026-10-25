import { OrderStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

/** Queda en `PaymentDetails.details`: el correo de reintento sale una sola vez por pedido. */
export const DECLINE_RETRY_MARKER = "Pago no aprobado, esperando reintento";

/**
 * Si un pedido pendiente ya tuvo un intento rechazado, para que la tienda
 * muestre el aviso de fallo al volver de la pasarela y no «confirmando…».
 * Se consulta aparte porque el detalle del pago (trae el correo) no viaja.
 */
export async function hasDeclinedPaymentAttempt(orderId: string, status: OrderStatus): Promise<boolean> {
  if (status !== OrderStatus.PENDING && status !== OrderStatus.CREATED) return false;
  const count = await prismadb.paymentDetails
    .count({ where: { orderId, details: { contains: DECLINE_RETRY_MARKER } } })
    .catch(() => 0);
  return count > 0;
}
