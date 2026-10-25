import {
  PaymentWebhookEventStatus,
  PaymentWebhookProvider,
  Prisma,
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

/** El `error` de la respuesta, como lo guarda la fila; null si no fue rechazo ni fallo. */
export async function readPaymentWebhookError(response: Response): Promise<string | null> {
  if (response.status < 400) return null;
  const body = await readBody(response);
  return typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
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

export const BOLD_INVALID_SIGNATURE_ERROR = "Firma de webhook Bold inválida";
export const WOMPI_INVALID_CHECKSUM_ERROR = "Checksum of transaction is not valid";

/** Los eventos de Bold que el webhook entiende; un cuerpo con otro `type` no parece de Bold. */
export const BOLD_KNOWN_EVENT_TYPES = [
  "SALE_APPROVED",
  "PAYMENT_APPROVED",
  "transaction.approved",
  "SALE_REJECTED",
  "VOID_APPROVED",
  "transaction.declined",
  "transaction.voided",
] as const;

/** Las filas que deja la conciliación horaria llevan `eventType` `reconcile:<estado>`. */
export const RECONCILIATION_EVENT_PREFIX = "reconcile:";

/**
 * Rechazos que salen antes de comprobar la firma (o porque la firma falla):
 * nada prueba que vengan de la pasarela. Son los sondeos del 2026-10-07 y no
 * avisan ni cuentan, salvo una firma inválida cuya referencia sí es un pedido
 * (el aviso en segundo plano le escribe `orderId`): eso es una llave rota.
 */
const UNAUTHENTICATED_REJECTIONS: Record<PaymentWebhookProvider, { exact: string[]; prefixes: string[] }> = {
  BOLD: { exact: ["Payload no recibido", BOLD_INVALID_SIGNATURE_ERROR], prefixes: [] },
  WOMPI: {
    exact: ["El cuerpo del webhook no es JSON válido", "Error on body request", WOMPI_INVALID_CHECKSUM_ERROR],
    prefixes: ["Event not found:"],
  },
};

const SIGNATURE_ERRORS: Record<PaymentWebhookProvider, string> = {
  BOLD: BOLD_INVALID_SIGNATURE_ERROR,
  WOMPI: WOMPI_INVALID_CHECKSUM_ERROR,
};

export type PaymentWebhookAlertKind = "server-error" | "authenticated-rejection" | "signature";

/**
 * Qué aviso merece una entrega según cómo terminó. `signature` todavía no
 * avisa: solo si su referencia resuelve a un pedido de la tienda.
 */
export function classifyPaymentWebhookAlert(
  provider: PaymentWebhookProvider,
  statusCode: number,
  error: string | null | undefined,
): PaymentWebhookAlertKind | null {
  if (statusCode >= 500) return "server-error";
  if (statusCode < 400) return null;
  const text = error ?? "";
  if (text === SIGNATURE_ERRORS[provider]) return "signature";
  const unauthenticated = UNAUTHENTICATED_REJECTIONS[provider];
  if (unauthenticated.exact.includes(text) || unauthenticated.prefixes.some((prefix) => text.startsWith(prefix))) return null;
  return "authenticated-rejection";
}

/** Lo mismo que `classifyPaymentWebhookAlert` dice «no auténtico», como filtro de Prisma. */
export const UNAUTHENTICATED_REJECTION_WHERE: Prisma.PaymentWebhookEventWhereInput = {
  OR: (Object.keys(UNAUTHENTICATED_REJECTIONS) as PaymentWebhookProvider[]).flatMap((provider) => [
    { provider, error: { in: UNAUTHENTICATED_REJECTIONS[provider].exact } },
    ...UNAUTHENTICATED_REJECTIONS[provider].prefixes.map((prefix) => ({ provider, error: { startsWith: prefix } })),
  ]),
};

/** `eventType` es nullable: un NOT solo dejaría fuera las filas sin tipo. */
export const NOT_RECONCILIATION_WHERE: Prisma.PaymentWebhookEventWhereInput = {
  OR: [{ eventType: null }, { NOT: { eventType: { startsWith: RECONCILIATION_EVENT_PREFIX } } }],
};

/** Rechazos y fallos que importan: 5xx, rechazos auténticos y firmas inválidas con pedido. */
export const PAYMENT_WEBHOOK_ISSUE_WHERE: Prisma.PaymentWebhookEventWhereInput = {
  status: { in: [PaymentWebhookEventStatus.REJECTED, PaymentWebhookEventStatus.FAILED] },
  AND: [
    NOT_RECONCILIATION_WHERE,
    {
      OR: [
        { status: PaymentWebhookEventStatus.FAILED },
        { statusCode: { gte: 500 } },
        { orderId: { not: null } },
        { NOT: UNAUTHENTICATED_REJECTION_WHERE },
      ],
    },
  ],
};

export const PAYMENT_WEBHOOK_ISSUE_WINDOW_DAYS = 7;

/** Rechazos y fallos recientes que importan, para la señal de Inicio (sin sondeos ni conciliación). */
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
  const where: Prisma.PaymentWebhookEventWhereInput = {
    OR: [{ storeId }, { storeId: null }],
    ...PAYMENT_WEBHOOK_ISSUE_WHERE,
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
