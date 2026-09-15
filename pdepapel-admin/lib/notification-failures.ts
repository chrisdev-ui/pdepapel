import prismadb from "@/lib/prismadb";

export type NotificationChannel = "EMAIL" | "WHATSAPP";

/**
 * Deja constancia de un aviso que no salió.
 *
 * Hasta ahora un fallo de envío solo iba a `console.error` y se perdía en los
 * registros de Vercel: nadie podía responder si a una clienta le llegó o no su
 * confirmación. Esto es el paso barato —guardarlo y poder buscarlo—, no el
 * sistema de reintentos que sí tienen las colas de Mercado Libre.
 *
 * Nunca lanza: si registrar el fallo falla, lo último que queremos es tumbar
 * la operación que lo provocó.
 */
export async function recordFailedNotification(input: {
  storeId?: string | null;
  channel: NotificationChannel;
  kind: string;
  recipient?: string | null;
  orderId?: string | null;
  error: unknown;
}): Promise<void> {
  const message =
    input.error instanceof Error
      ? `${input.error.name}: ${input.error.message}`
      : String(input.error ?? "Error desconocido");

  try {
    await prismadb.failedNotification.create({
      data: {
        storeId: input.storeId ?? null,
        channel: input.channel,
        kind: input.kind,
        recipient: input.recipient ?? null,
        orderId: input.orderId ?? null,
        error: message.slice(0, 2_000),
      },
    });
  } catch (loggingError) {
    console.error("[NOTIFICACIONES] No se pudo registrar el fallo de envío:", {
      kind: input.kind,
      original: message,
      loggingError,
    });
  }
}
