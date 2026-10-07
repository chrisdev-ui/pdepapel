import { runInBackground } from "@/lib/background";
import { recordFailedNotification } from "@/lib/notification-failures";
import prismadb from "@/lib/prismadb";
import { createGuideForOrder } from "@/lib/shipping-helpers";

/**
 * Crea la guía de EnvioClick sin retrasar la respuesta (pago confirmado por
 * webhook, checkout pagado del todo con tarjeta de regalo), y sin que un
 * fallo pase en silencio.
 *
 * Antes iba en un `setImmediate` que solo escribía en consola: una guía que no
 * se creaba dejaba el pedido en «Por despachar» sin decir por qué, y una
 * instancia congelada podía cortarla a medias. Ahora:
 * - corre con `waitUntil` (lib/background.ts);
 * - si falla, el motivo queda en el envío (`guideError`, `guideAttemptedAt`),
 *   que el panel muestra en el bloque de la guía del pedido, como ya hacía el
 *   guardado manual del pedido;
 * - y queda una fila `GUIDE` en `FailedNotification` para buscarla.
 *
 * NUNCA se reintenta sola: una guía de EnvioClick se paga al crearla, y un
 * reintento a ciegas puede pagar dos. Se crea a mano desde el pedido.
 */
export function createGuideInBackground(params: { orderId: string; storeId: string; source: string }): void {
  runInBackground(`guía de EnvioClick (${params.source})`, () => createGuideRecordingFailure(params));
}

export async function createGuideRecordingFailure(params: { orderId: string; storeId: string; source: string }): Promise<boolean> {
  try {
    await createGuideForOrder(params.orderId, params.storeId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Otra petición ya la creó (webhook repetido): no es un fallo.
    if (/Guide already exists/i.test(message)) return true;
    console.error(`[GUIDE] ${params.source}: no se pudo crear la guía del pedido ${params.orderId}:`, error);
    try {
      await prismadb.shipping.updateMany({
        where: { orderId: params.orderId, storeId: params.storeId, envioClickIdOrder: null },
        data: { guideError: `${params.source}: ${message}`.slice(0, 2_000), guideAttemptedAt: new Date() },
      });
    } catch (updateError) {
      console.error("[GUIDE] No se pudo guardar el motivo en el envío:", updateError);
    }
    await recordFailedNotification({
      storeId: params.storeId,
      channel: "GUIDE",
      kind: "guide:create",
      recipient: null,
      orderId: params.orderId,
      error,
    });
    return false;
  }
}
