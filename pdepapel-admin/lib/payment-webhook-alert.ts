import { PaymentWebhookEventStatus, type PaymentWebhookProvider } from "@prisma/client";
import { Redis } from "@upstash/redis";

import { PanelNotice } from "@/emails/panel-notice";
import { runInBackground } from "@/lib/background";
import { deliverEmails, type ResendSendResult } from "@/lib/email-delivery";
import {
  BOLD_KNOWN_EVENT_TYPES,
  classifyPaymentWebhookAlert,
  readPaymentWebhookError,
  type PaymentWebhookAlertKind,
  type PaymentWebhookContext,
} from "@/lib/payment-webhook-events";
import prismadb from "@/lib/prismadb";
import { getAdminNotificationRecipients } from "@/lib/store-email-settings";

const ALERT_COOLDOWN_SECONDS = 3600;
const PANEL_URL = "https://admin.papeleriapdepapel.com";
const PROVIDER_LABEL: Record<PaymentWebhookProvider, string> = { BOLD: "Bold", WOMPI: "Wompi" };
/** Nombres de las variables, nunca sus valores. */
const KEY_VARIABLES: Record<PaymentWebhookProvider, { webhook: string; api: string }> = {
  BOLD: { webhook: "BOLD_SECRET_KEY", api: "NEXT_PUBLIC_BOLD_IDENTITY_KEY" },
  WOMPI: { webhook: "WOMPI_EVENTS_KEY", api: "WOMPI_API_SECRET" },
};

export type PaymentAlertKind = PaymentWebhookAlertKind | "reconcile-mismatch" | "reconcile-applied" | "reconcile-voided" | "key-rejected";

type AlertRedis = { set: (key: string, value: string, options: { nx: true; ex: number }) => Promise<unknown> };
type Send = (email: { from: string; to: string[]; subject: string; text: string; react?: React.ReactElement }) => Promise<ResendSendResult>;

export interface PaymentAlertDeps {
  redis?: AlertRedis;
  send?: Send;
  recipients?: (storeId?: string) => Promise<string[]>;
  /** Fuera de producción no sale nada, salvo que una prueba lo pida. */
  enabled?: boolean;
  now?: Date;
}

export interface PaymentAlert {
  provider: PaymentWebhookProvider;
  kind: PaymentAlertKind;
  storeId?: string | null;
  orderId?: string | null;
  orderNumber?: string | null;
  statusCode?: number | null;
  error?: string | null;
}

export type PaymentAlertResult = "sent" | "cooldown" | "failed" | "skipped";

const isEnabled = (deps: PaymentAlertDeps) => deps.enabled ?? process.env.VERCEL_ENV === "production";

function bogotaTime(date: Date) {
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(date);
}

function describe(alert: PaymentAlert): { subject: string; title: string; summary: string; action: string } {
  const label = PROVIDER_LABEL[alert.provider];
  const order = alert.orderNumber ? ` del pedido #${alert.orderNumber}` : "";
  const variables = KEY_VARIABLES[alert.provider];
  switch (alert.kind) {
    case "server-error":
      return {
        subject: `⚠️ El webhook de ${label} está fallando`,
        title: `Webhook de ${label} con error interno`,
        summary: `${label} avisó un pago${order} y el panel respondió con error (HTTP ${alert.statusCode ?? 500}). Mientras falle, el pedido no se marca pagado.`,
        action: "Revisa los registros del panel en Vercel. La conciliación de cada hora vuelve a consultar los pedidos sin pagar.",
      };
    case "authenticated-rejection":
      return {
        subject: `⚠️ Aviso de pago de ${label} sin aplicar`,
        title: `Aviso de ${label} que no se pudo aplicar`,
        summary: `${label} envió un aviso con firma válida${order} que no se aplicó: ${alert.error ?? "sin detalle"}. Es dinero real.`,
        action: "Revisa el pedido y el pago en el panel de la pasarela antes de despachar o reembolsar.",
      };
    case "signature":
      return {
        subject: `⚠️ Firma inválida en un aviso de ${label}`,
        title: `Firma inválida en un aviso de ${label}`,
        summary: `Llegó un aviso de ${label}${order} con la firma inválida. Si el pago es real, la llave del webhook está mal configurada o se rotó.`,
        action: `Confirma en Vercel que ${variables.webhook} coincide con la del panel de ${label}.`,
      };
    case "reconcile-mismatch":
      return {
        subject: `⚠️ Pago de ${label} con monto distinto`,
        title: "La conciliación encontró un pago que no cuadra",
        summary: `${label} reporta aprobado un pago${order}, pero el monto o la moneda no coinciden con el pedido. No se marcó pagado.`,
        action: "Revisa el pago en el panel de la pasarela y decide a mano.",
      };
    case "reconcile-applied":
      return {
        subject: `⚠️ Un pago de ${label} llegó por la conciliación`,
        title: `El webhook de ${label} no avisó`,
        summary: `La conciliación de cada hora encontró aprobado un pago${order} que el webhook nunca aplicó, y lo marcó pagado.`,
        action: `Revisa en el panel de ${label} que el webhook siga configurado hacia el panel.`,
      };
    case "reconcile-voided":
      return {
        subject: `⚠️ Un pago de ${label} se anuló en la pasarela`,
        title: `${label} anuló un pago ya registrado`,
        summary: `La conciliación de cada hora encontró anulado en ${label} un pago${order} que el panel tenía como pagado. El pedido quedó cancelado, el inventario volvió y el cupón se liberó.`,
        action: `Si la anulación no la hiciste tú desde el panel de ${label}, revísala allí antes de despachar.`,
      };
    case "key-rejected":
      return {
        subject: `⚠️ Llave de ${label} rechazada`,
        title: `Llave de ${label} rechazada`,
        summary: `La conciliación de pagos consultó ${label} y la pasarela rechazó la llave (HTTP ${alert.statusCode ?? "?"}). Mientras tanto no se concilia ningún pago de ${label}.`,
        action: `Revisa en Vercel la variable ${variables.api} contra la llave del panel de ${label}.`,
      };
  }
}

async function countLastHour(provider: PaymentWebhookProvider, now: Date): Promise<number | null> {
  try {
    return await prismadb.paymentWebhookEvent.count({
      where: {
        provider,
        status: { in: [PaymentWebhookEventStatus.REJECTED, PaymentWebhookEventStatus.FAILED] },
        createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    });
  } catch {
    return null;
  }
}

/**
 * Un correo por hora por proveedor y tipo, calcado de `db-health-alert`: una
 * firma rota no lo tapa un 5xx. Si Redis falla, sale igual (los sondeos ya
 * se filtraron antes, no hay avalancha posible).
 */
export async function sendPaymentAlert(alert: PaymentAlert, deps: PaymentAlertDeps = {}): Promise<PaymentAlertResult> {
  if (!isEnabled(deps)) return "skipped";
  const now = deps.now ?? new Date();
  try {
    const claimed = await (deps.redis ?? Redis.fromEnv()).set(`monitor:payment-webhook:${alert.provider}:${alert.kind}`, "1", { nx: true, ex: ALERT_COOLDOWN_SECONDS });
    if (claimed !== "OK") return "cooldown";
  } catch (error) {
    console.error("[PAYMENT_ALERT] No se pudo revisar la pausa del aviso; se manda igual:", error);
  }

  const to = await (deps.recipients ?? ((storeId?: string) => getAdminNotificationRecipients(storeId)))(alert.storeId ?? undefined);
  if (to.length === 0) {
    console.warn("[PAYMENT_ALERT] Sin correos para avisos en Configuración ni correo de la tienda; no se avisa.");
    return "failed";
  }
  const { subject, title, summary, action } = describe(alert);
  const recent = alert.kind.startsWith("reconcile") || alert.kind === "key-rejected" ? null : await countLastHour(alert.provider, now);
  const lines = [
    `Pasarela: ${PROVIDER_LABEL[alert.provider]}`,
    ...(alert.orderNumber ? [`Pedido: #${alert.orderNumber}`] : []),
    ...(alert.error ? [`Error: ${alert.error}`] : []),
    `Hora (Bogotá): ${bogotaTime(now)}`,
    ...(recent !== null ? [`Avisos rechazados o fallidos de ${PROVIDER_LABEL[alert.provider]} en la última hora: ${recent}`] : []),
  ];
  const link = alert.orderId && alert.storeId ? `${PANEL_URL}/${alert.storeId}/pedidos/${alert.orderId}` : PANEL_URL;
  const note = "Este aviso sale como mucho una vez por hora.";
  const send: Send =
    deps.send ??
    (async (email) => {
      const { resend } = await import("@/lib/resend");
      return resend.emails.send(email) as Promise<ResendSendResult>;
    });
  const outcomes = await deliverEmails(
    [
      {
        role: "admin",
        send: () =>
          send({
            from: "Papelería P de Papel <orders@papeleriapdepapel.com>",
            to,
            subject,
            react: PanelNotice({
              preview: title,
              label: "Panel · Pagos",
              tint: "alert",
              title,
              meta: alert.orderNumber ? `Pedido #${alert.orderNumber} · ${PROVIDER_LABEL[alert.provider]}` : PROVIDER_LABEL[alert.provider],
              summary,
              sections: [{ label: "Detalle", lines }],
              action,
              cta: { href: link, label: alert.orderId ? "Abrir el pedido" : "Abrir el panel" },
              note,
            }) as React.ReactElement,
            text: `${summary}\n\n${lines.join("\n")}\n\n${action}\n${link}\n\n${note}`,
          }),
      },
    ],
    { storeId: alert.storeId ?? null, orderId: alert.orderId ?? null, kind: "payment-webhook-alert" },
  );
  return outcomes.admin?.ok ? "sent" : "failed";
}

/** La referencia de un cuerpo que parece de la pasarela; null si no lo parece. */
export function gatewayReferenceOf(provider: PaymentWebhookProvider, rawBody: string): string | null {
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (provider === "BOLD") {
    const reference = payload?.data?.metadata?.reference;
    return (BOLD_KNOWN_EVENT_TYPES as readonly string[]).includes(payload?.type) && typeof reference === "string" && reference ? reference : null;
  }
  const reference = payload?.data?.transaction?.reference;
  return payload?.event === "transaction.updated" && typeof reference === "string" && reference ? reference : null;
}

export interface WebhookAlertInput {
  provider: PaymentWebhookProvider;
  eventId: string | null;
  statusCode: number;
  error: string | null;
  rawBody: string;
  context: PaymentWebhookContext;
}

/**
 * Decide y manda el aviso de una entrega ya respondida. Una firma inválida
 * solo avisa si su referencia es un pedido de la tienda; entonces la fila
 * guarda ese `orderId`, que es lo que la cuenta de Sistemas e Inicio mira.
 */
export async function alertPaymentWebhook(input: WebhookAlertInput, deps: PaymentAlertDeps = {}): Promise<PaymentAlertResult> {
  if (!isEnabled(deps)) return "skipped";
  const kind = classifyPaymentWebhookAlert(input.provider, input.statusCode, input.error);
  if (!kind) return "skipped";

  let storeId = input.context.storeId ?? null;
  let orderId = input.context.orderId ?? null;
  let orderNumber: string | null = null;

  if (kind === "signature") {
    const reference = gatewayReferenceOf(input.provider, input.rawBody);
    if (!reference) return "skipped";
    const order = await prismadb.order.findFirst({
      where: input.provider === "BOLD" ? { OR: [{ id: reference }, { orderNumber: reference }] } : { id: reference },
      select: { id: true, storeId: true, orderNumber: true },
    });
    if (!order) return "skipped";
    ({ storeId, orderNumber } = order);
    orderId = order.id;
    if (input.eventId) {
      await prismadb.paymentWebhookEvent
        .update({ where: { id: input.eventId }, data: { orderId: order.id, storeId: order.storeId, orderReference: reference } })
        .catch((error: unknown) => console.error("[PAYMENT_ALERT] No se pudo anotar el pedido en el evento:", error));
    }
  } else if (orderId) {
    orderNumber = (await prismadb.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } }).catch(() => null))?.orderNumber ?? null;
  }

  return sendPaymentAlert({ provider: input.provider, kind, storeId, orderId, orderNumber, statusCode: input.statusCode, error: input.error }, deps);
}

/**
 * Lo llama cada webhook al terminar. La respuesta se copia aquí, antes de
 * devolverla, porque Next consume el cuerpo original.
 */
export function schedulePaymentWebhookAlert(
  provider: PaymentWebhookProvider,
  eventId: string | null,
  response: Response,
  rawBody: string,
  context: PaymentWebhookContext,
): void {
  if (response.status < 400) return;
  const copy = response.clone();
  const snapshot = { ...context };
  runInBackground("aviso de webhook de pago", async () =>
    alertPaymentWebhook({ provider, eventId, statusCode: copy.status, error: await readPaymentWebhookError(copy), rawBody, context: snapshot }),
  );
}

/** Una excepción que escapó del handler es un 500. */
export function schedulePaymentWebhookCrashAlert(
  provider: PaymentWebhookProvider,
  eventId: string | null,
  error: unknown,
  rawBody: string,
  context: PaymentWebhookContext,
): void {
  const snapshot = { ...context };
  runInBackground("aviso de webhook de pago", () =>
    alertPaymentWebhook({ provider, eventId, statusCode: 500, error: error instanceof Error ? error.message : String(error), rawBody, context: snapshot }),
  );
}
