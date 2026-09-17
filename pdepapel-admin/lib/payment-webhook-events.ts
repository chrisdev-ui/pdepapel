import {
  PaymentWebhookEventStatus,
  PaymentWebhookProvider,
} from "@prisma/client";

import prismadb from "@/lib/prismadb";

/**
 * Lo que el handler va descubriendo mientras procesa —qué pedido era, qué
 * transacción, qué evento— y que conviene dejar en la fila. Se rellena por
 * el camino porque al recibir el webhook todavía no se sabe nada de eso.
 */
export interface PaymentWebhookContext {
  storeId?: string | null;
  eventType?: string | null;
  transactionId?: string | null;
  orderReference?: string | null;
  orderId?: string | null;
}

const SIGNATURE_HEADERS: Record<PaymentWebhookProvider, string | null> = {
  BOLD: "x-bold-signature",
  // Wompi manda el checksum dentro del cuerpo, no en una cabecera.
  WOMPI: null,
};

function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}

/**
 * Deja la fila antes de verificar nada, para que también quede lo que se
 * rechaza. Nunca lanza: registrar no puede tumbar un pago. Si la base no
 * responde, devuelve `null` y el webhook sigue como siempre.
 */
export async function recordPaymentWebhookReceived(options: {
  provider: PaymentWebhookProvider;
  request: Request;
  rawBody: string;
  storeId?: string | null;
}): Promise<string | null> {
  const header = SIGNATURE_HEADERS[options.provider];
  const payload = parseJson(options.rawBody);
  try {
    const event = await prismadb.paymentWebhookEvent.create({
      data: {
        provider: options.provider,
        storeId: options.storeId ?? null,
        rawBody: options.rawBody,
        signature: header ? options.request.headers.get(header) : null,
        payload: payload === undefined ? undefined : (payload as object),
      },
      select: { id: true },
    });
    return event.id;
  } catch (error) {
    console.error(
      `[PAYMENT_WEBHOOK] No se pudo registrar el evento de ${options.provider}:`,
      error,
    );
    return null;
  }
}

/**
 * Traduce cómo terminó la petición a un estado. Un 200 sin cambio de estado
 * en el pedido —evento desconocido, pedido ya pagado— se marca IGNORED para
 * que no se confunda con un pago procesado.
 */
export function classifyPaymentWebhookOutcome(
  statusCode: number,
  body: { error?: unknown; message?: unknown } | null,
): PaymentWebhookEventStatus {
  if (statusCode >= 500) return PaymentWebhookEventStatus.FAILED;
  if (statusCode >= 400) return PaymentWebhookEventStatus.REJECTED;
  const message = typeof body?.message === "string" ? body.message : "";
  if (/acknowledged|ya fue procesada/i.test(message)) {
    return PaymentWebhookEventStatus.IGNORED;
  }
  return PaymentWebhookEventStatus.PROCESSED;
}

async function readBody(
  response: Response,
): Promise<{ error?: unknown; message?: unknown } | null> {
  try {
    const text = await response.clone().text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Cierra la fila con lo que respondió el handler. Lee el cuerpo por una copia
 * para no consumir la respuesta que se devuelve al proveedor. Tampoco lanza.
 */
export async function completePaymentWebhookEvent(
  eventId: string | null,
  response: Response,
  context: PaymentWebhookContext = {},
): Promise<void> {
  if (!eventId) return;
  try {
    const body = await readBody(response);
    const status = classifyPaymentWebhookOutcome(response.status, body);
    const error =
      status === PaymentWebhookEventStatus.REJECTED ||
      status === PaymentWebhookEventStatus.FAILED
        ? typeof body?.error === "string"
          ? body.error
          : `HTTP ${response.status}`
        : null;
    await prismadb.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        status,
        statusCode: response.status,
        error,
        storeId: context.storeId ?? undefined,
        eventType: context.eventType ?? undefined,
        transactionId: context.transactionId ?? undefined,
        orderReference: context.orderReference ?? undefined,
        orderId: context.orderId ?? undefined,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `[PAYMENT_WEBHOOK] No se pudo cerrar el evento ${eventId}:`,
      error,
    );
  }
}

export async function completePaymentWebhookEventWithError(
  eventId: string | null,
  error: unknown,
  context: PaymentWebhookContext = {},
): Promise<void> {
  if (!eventId) return;
  try {
    await prismadb.paymentWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: PaymentWebhookEventStatus.FAILED,
        statusCode: 500,
        error: error instanceof Error ? error.message : String(error),
        storeId: context.storeId ?? undefined,
        eventType: context.eventType ?? undefined,
        transactionId: context.transactionId ?? undefined,
        orderReference: context.orderReference ?? undefined,
        orderId: context.orderId ?? undefined,
        completedAt: new Date(),
      },
    });
  } catch (updateError) {
    console.error(
      `[PAYMENT_WEBHOOK] No se pudo marcar como fallido el evento ${eventId}:`,
      updateError,
    );
  }
}

export const PAYMENT_WEBHOOK_ISSUE_WINDOW_DAYS = 7;

/** Rechazos y fallos recientes, para la señal de Inicio. */
export async function countRecentPaymentWebhookIssues(
  storeId: string,
  now = new Date(),
): Promise<{
  count: number;
  latest: {
    provider: PaymentWebhookProvider;
    error: string | null;
    createdAt: Date;
  } | null;
}> {
  const since = new Date(
    now.getTime() - PAYMENT_WEBHOOK_ISSUE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  // Un evento rechazado antes de resolver el pedido no tiene storeId salvo que
  // Bold lo mande en la URL: se cuentan los de la tienda y los huérfanos.
  const where = {
    OR: [{ storeId }, { storeId: null }],
    status: {
      in: [
        PaymentWebhookEventStatus.REJECTED,
        PaymentWebhookEventStatus.FAILED,
      ],
    },
    createdAt: { gte: since },
  };
  try {
    const [count, latest] = await Promise.all([
      prismadb.paymentWebhookEvent.count({ where }),
      prismadb.paymentWebhookEvent.findFirst({
        where,
        orderBy: { createdAt: "desc" },
        select: { provider: true, error: true, createdAt: true },
      }),
    ]);
    return { count, latest };
  } catch {
    return { count: 0, latest: null };
  }
}
