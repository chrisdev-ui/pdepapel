import { PaymentWebhookEventStatus } from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Noventa días para lo que salió bien. Un pago procesado deja su rastro en el
 * pedido (`paymentDetails.transactionId`), así que la fila sólo sirve para
 * reproducir la llamada a mano; tres meses cubren una disputa de tarjeta con
 * margen. Los rechazos y los fallos no se borran nunca desde aquí: son pocos y
 * son exactamente lo que se quiere poder consultar cuando algo no cuadró.
 */
export const PAYMENT_WEBHOOK_EVENT_RETENTION_DAYS = 90;

export async function pruneSettledPaymentWebhookEvents(
  options: { olderThanDays?: number; now?: Date } = {},
): Promise<{ deleted: number; olderThanDays: number; cutoff: Date }> {
  const olderThanDays =
    options.olderThanDays ?? PAYMENT_WEBHOOK_EVENT_RETENTION_DAYS;
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000);

  const { count } = await prismadb.paymentWebhookEvent.deleteMany({
    where: {
      status: {
        in: [
          PaymentWebhookEventStatus.PROCESSED,
          PaymentWebhookEventStatus.IGNORED,
        ],
      },
      completedAt: { lt: cutoff },
    },
  });

  return { deleted: count, olderThanDays, cutoff };
}
