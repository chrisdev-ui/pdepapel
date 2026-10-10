import { recordFailedNotification } from "@/lib/notification-failures";

/**
 * A quién va un correo de pedido. Se guarda así en
 * `FailedNotification.recipient`: el rol, nunca la dirección.
 */
export type EmailRole = "admin" | "customer";
export const EMAIL_ROLES: readonly EmailRole[] = ["admin", "customer"];

/** Lo que devuelve `resend.emails.send` (SDK 2.x): no lanza ante un error de la API. */
export interface ResendSendResult {
  data?: { id: string } | null;
  error?: { name?: string; message?: string } | null;
}

export type DeliveryOutcome =
  | { ok: true; attempts: number; id?: string }
  | { ok: false; attempts: number; error: string; retryable: boolean };

/** Errores de la API de Resend que vale la pena reintentar (429 y 5xx). */
const RETRYABLE_RESEND_ERRORS = new Set(["rate_limit_exceeded", "application_error", "internal_server_error"]);

/**
 * ¿Se reintenta? Sí ante fallos de red (fetch failed, ECONNRESET, timeouts),
 * 429 y 5xx. No ante errores de validación (4xx): repetirlos da lo mismo.
 * Un error de la API sin nombre conocido cuenta como del servidor.
 */
export function isRetryableEmailFailure(failure: unknown): boolean {
  if (failure && typeof failure === "object" && "name" in failure && !(failure instanceof Error)) {
    const name = String((failure as { name?: unknown }).name ?? "");
    if (!name) return true;
    return RETRYABLE_RESEND_ERRORS.has(name);
  }
  // Excepción lanzada por fetch o por el SDK: red caída, TLS cortado, timeout,
  // o una respuesta 5xx que ni siquiera trae JSON.
  return true;
}

function describeFailure(failure: unknown): string {
  if (failure instanceof Error) {
    const cause = (failure as { cause?: { code?: string; message?: string } }).cause;
    const detail = cause?.code ?? cause?.message;
    return `${failure.name}: ${failure.message}${detail ? ` (${detail})` : ""}`;
  }
  if (failure && typeof failure === "object") {
    const { name, message } = failure as { name?: string; message?: string };
    return `${name ?? "resend_error"}: ${message ?? "sin mensaje"}`;
  }
  return String(failure ?? "Error desconocido");
}

export const DEFAULT_RETRY_DELAYS_MS = [1_000, 3_000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Manda un correo con hasta dos reintentos (≈1 s y ≈3 s) si el fallo es de
 * red, 429 o 5xx. Un `{ error }` de Resend cuenta como fallo. Nunca lanza.
 */
export async function sendWithRetry(
  send: () => Promise<ResendSendResult | void>,
  options: { delaysMs?: number[]; wait?: (ms: number) => Promise<void> } = {},
): Promise<DeliveryOutcome> {
  const delays = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const wait = options.wait ?? sleep;
  let attempts = 0;
  for (;;) {
    attempts += 1;
    let failure: unknown;
    try {
      const result = await send();
      if (!result || !result.error) return { ok: true, attempts, id: result?.data?.id };
      failure = result.error;
    } catch (error) {
      failure = error;
    }
    const retryable = isRetryableEmailFailure(failure);
    if (!retryable || attempts > delays.length) {
      return { ok: false, attempts, error: describeFailure(failure), retryable };
    }
    await wait(delays[attempts - 1]);
  }
}

export interface EmailJob {
  role: EmailRole;
  send: () => Promise<ResendSendResult | void>;
}

/**
 * Manda cada correo por su lado: que falle el del admin nunca impide el de
 * la clienta (antes iban en el mismo `try` y el primero que fallaba cortaba
 * el resto). Cada destinatario que no recibe su correo deja su propia fila en
 * `FailedNotification`, con el rol y no la dirección.
 */
export async function deliverEmails(
  jobs: EmailJob[],
  context: {
    storeId?: string | null;
    orderId?: string | null;
    kind: string;
    /** El barrido de reintentos registra él mismo, para contar intentos. */
    recordFailures?: boolean;
    delaysMs?: number[];
    wait?: (ms: number) => Promise<void>;
  },
): Promise<Partial<Record<EmailRole, DeliveryOutcome>>> {
  const settled = await Promise.allSettled(
    jobs.map(async (job) => ({ role: job.role, outcome: await sendWithRetry(job.send, context) })),
  );
  const outcomes: Partial<Record<EmailRole, DeliveryOutcome>> = {};
  for (let index = 0; index < settled.length; index += 1) {
    const result = settled[index];
    const role = jobs[index].role;
    // sendWithRetry no lanza; un rechazo aquí sería un fallo inesperado.
    const outcome: DeliveryOutcome =
      result.status === "fulfilled"
        ? result.value.outcome
        : { ok: false, attempts: 0, error: describeFailure(result.reason), retryable: true };
    outcomes[role] = outcome;
    if (!outcome.ok) {
      console.error(`[EMAIL] ${context.kind} al ${role} no salió tras ${outcome.attempts} intento(s): ${outcome.error}`);
      if (context.recordFailures !== false) {
        await recordFailedNotification({
          storeId: context.storeId,
          channel: "EMAIL",
          kind: context.kind,
          recipient: role,
          orderId: context.orderId,
          error: outcome.error,
        });
      }
    }
  }
  return outcomes;
}
