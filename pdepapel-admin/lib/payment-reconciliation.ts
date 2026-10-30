import {
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentWebhookEventStatus,
  type OrderPayment,
  type PaymentWebhookProvider,
} from "@prisma/client";

import { getBoldOrderReference, getBoldPaymentVoucher, type BoldPaymentVoucher } from "@/lib/bold";
import { KEY_PROBE_REFERENCE, type GatewayFetchOptions, type GatewayLookup } from "@/lib/payment-gateway-lookup";
import {
  boldAmountMatchesOrder,
  isOnlineCheckoutOrder,
  SETTLEMENT_ORDER_INCLUDE,
  settleCancelledPayment,
  settleDeclinedPayment,
  settlePaidPayment,
  wompiTransactionMatchesOrder,
  type SettlementOrder,
} from "@/lib/payment-settlement";
import { sendPaymentAlert, type PaymentAlertDeps } from "@/lib/payment-webhook-alert";
import { RECONCILIATION_EVENT_PREFIX } from "@/lib/payment-webhook-events";
import { processDepositCharge } from "@/lib/deposit-charge-webhook";
import { boldAmountMatchesDue, wompiCentsMatchDue } from "@/lib/order-payment-amounts";
import { ONLINE_REFERENCE_PATTERN } from "@/lib/preorder-online-rules";
import prismadb from "@/lib/prismadb";
import { findWompiTransactionsByReference, type WompiApiConfig, type WompiTransaction } from "@/lib/wompi-api";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Antes de esto la clienta puede seguir pagando; Bold tarda hasta 10 min en mostrar la venta. */
export const RECONCILE_MIN_AGE_MS = 15 * MINUTE;
/** Bold guarda la consulta 24 h; Wompi, lo que el dueño aprobó. */
export const RECONCILE_MAX_AGE_MS: Record<"Bold" | "Wompi", number> = { Bold: 24 * HOUR, Wompi: 72 * HOUR };
/**
 * Un rechazo deja el pedido pendiente para reintentar (correo «Tu pago no se
 * aprobó»); pasado esto desde el último intento, se cancela por el camino de
 * siempre. Las pruebas del sandbox la acortan (`declineRetryWindowMs`).
 */
export const DECLINE_RETRY_WINDOW_MS = 2 * HOUR;
export const RECONCILE_BATCH_SIZE = 40;
export const RECONCILE_CONCURRENCY = 4;
export const RECONCILE_BUDGET_MS = 45 * 1000;
/** Tantas consultas seguidas sin respuesta y esa pasarela se deja por esta corrida. */
export const RECONCILE_UNAVAILABLE_STREAK = 3;

// ERROR también es final: el webhook lo trata como rechazo y aquí se cancela pasada la ventana.
const WOMPI_CANCELLED = new Set(["DECLINED", "ERROR", "VOIDED"]);
const BOLD_CANCELLED = new Set(["REJECTED", "VOIDED"]);

type Provider = "Bold" | "Wompi";
const WEBHOOK_PROVIDER: Record<Provider, PaymentWebhookProvider> = { Bold: "BOLD", Wompi: "WOMPI" };

export interface ReconciliationDeps extends GatewayFetchOptions {
  now?: Date;
  /** Reloj para el presupuesto de la corrida (pruebas). */
  clock?: () => number;
  wompi: WompiApiConfig;
  bold: { identityKey: string };
  alerts?: PaymentAlertDeps;
  budgetMs?: number;
  /** Solo para acortar la ventana de reintento (sandbox); nunca más larga que `DECLINE_RETRY_WINDOW_MS`. */
  declineRetryWindowMs?: number;
}

/** Lee `PAYMENT_DECLINE_RETRY_WINDOW_MINUTES` (solo pruebas): 1 a 120 min, si no, la ventana normal. */
export function declineRetryWindowFromEnv(raw: string | undefined): number | undefined {
  const minutes = Number(raw);
  if (!raw || !Number.isFinite(minutes)) return undefined;
  return Math.min(Math.max(Math.round(minutes), 1), DECLINE_RETRY_WINDOW_MS / MINUTE) * MINUTE;
}

interface ProviderState {
  configured: boolean;
  lookups: number;
  unavailable: number;
  streak: number;
  inFlight: number;
  skipped: number;
  lastUnavailable: string | null;
  keyRejected: number | null;
  verified: boolean;
  probed: boolean;
}

export interface ReconciliationSummary {
  ok: boolean;
  detail: string;
  checked: number;
  paid: number;
  cancelled: number;
  unchanged: number;
  alreadyApplied: number;
  mismatched: number;
  failed: number;
  /** Pagados que se volvieron a consultar y los que la pasarela anuló. */
  rechecked: number;
  voided: number;
  /** Pagados que la pasarela anuló pero son para recoger o ya salieron: solo aviso. */
  heldForReview: number;
  /** Pendientes con un rechazo, dentro de la ventana de reintento. */
  awaitingRetry: number;
  partial: boolean;
  gateways: Record<Provider, { lookups: number; unavailable: number; skipped: number; keyRejected: number | null; verified: boolean }>;
}

const providerOf = (order: SettlementOrder): Provider => (order.payment?.method === PaymentMethod.Bold ? "Bold" : "Wompi");

/**
 * Pedidos de pago en línea que siguen sin cobrar entre 15 min y el tope de su
 * pasarela, los más nuevos primero (los viejos ya se consultaron muchas
 * horas). El punto de venta, la feria y el datáfono no son Botón de pagos:
 * se quitan en memoria porque `source` y `details` aceptan null y un NOT en
 * SQL dejaría fuera esas filas.
 */
export async function selectReconciliationCandidates(now: Date): Promise<SettlementOrder[]> {
  const youngest = new Date(now.getTime() - RECONCILE_MIN_AGE_MS);
  const rows = await prismadb.order.findMany({
    where: {
      status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
      type: { not: OrderType.POINT_OF_SALE },
      createdAt: { lte: youngest },
      OR: (["Wompi", "Bold"] as const).map((provider) => ({
        payment: { method: PaymentMethod[provider] },
        createdAt: { gte: new Date(now.getTime() - RECONCILE_MAX_AGE_MS[provider]) },
      })),
    },
    include: SETTLEMENT_ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: RECONCILE_BATCH_SIZE * 2,
  });
  return rows
    .filter(isOnlineCheckoutOrder)
    .slice(0, RECONCILE_BATCH_SIZE);
}

/**
 * Abonos y saldos pagados desde `/pedido` (`-P<n>`) que siguen PENDING entre
 * 15 min y el tope de su pasarela. Se consultan por su propia referencia:
 * nunca pasan por la del pedido ni por `settlePaidPayment`, así que un pedido
 * con anticipo jamás se da por pagado completo desde aquí.
 */
export async function selectOnlinePreorderCandidates(now: Date): Promise<OrderPayment[]> {
  const youngest = new Date(now.getTime() - RECONCILE_MIN_AGE_MS);
  const rows = await prismadb.orderPayment.findMany({
    where: {
      status: OrderPaymentStatus.PENDING,
      kind: { in: [OrderPaymentKind.INSTALLMENT, OrderPaymentKind.BALANCE] },
      gatewayReference: { not: null },
      createdAt: { lte: youngest },
      OR: (["Wompi", "Bold"] as const).map((provider) => ({
        method: PaymentMethod[provider],
        createdAt: { gte: new Date(now.getTime() - RECONCILE_MAX_AGE_MS[provider]) },
      })),
    },
    orderBy: { createdAt: "desc" },
    take: RECONCILE_BATCH_SIZE,
  });
  return rows.filter((row) => row.gatewayReference !== null && ONLINE_REFERENCE_PATTERN.test(row.gatewayReference));
}

/**
 * Pedidos en línea ya pagados dentro de la misma ventana de cada pasarela,
 * contada desde el pago. Una anulación hecha en el panel de Wompi no manda
 * evento (probado en sandbox 2026-10-25), así que solo así se entera el panel.
 */
export async function selectPaidRecheckCandidates(now: Date): Promise<SettlementOrder[]> {
  const rows = await prismadb.order.findMany({
    where: {
      status: OrderStatus.PAID,
      type: { not: OrderType.POINT_OF_SALE },
      OR: (["Wompi", "Bold"] as const).map((provider) => ({
        payment: { method: PaymentMethod[provider] },
        paidAt: { gte: new Date(now.getTime() - RECONCILE_MAX_AGE_MS[provider]) },
      })),
    },
    include: SETTLEMENT_ORDER_INCLUDE,
    orderBy: { paidAt: "desc" },
    take: RECONCILE_BATCH_SIZE * 2,
  });
  return rows
    .filter((order) => order.status === OrderStatus.PAID && isOnlineCheckoutOrder(order))
    .slice(0, RECONCILE_BATCH_SIZE);
}

function parseDate(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? (value < 1e12 ? value * 1000 : value) : null;
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

async function logReconciliation(input: {
  provider: Provider;
  order: SettlementOrder;
  gatewayStatus: string;
  transactionId: string | null;
  gateway: unknown;
  status: PaymentWebhookEventStatus;
  statusCode: number;
  error?: string | null;
  now: Date;
}) {
  try {
    await prismadb.paymentWebhookEvent.create({
      data: {
        provider: WEBHOOK_PROVIDER[input.provider],
        storeId: input.order.storeId,
        orderId: input.order.id,
        orderReference: input.provider === "Bold" ? getBoldOrderReference(input.order) : input.order.id,
        transactionId: input.transactionId,
        eventType: `${RECONCILIATION_EVENT_PREFIX}${input.gatewayStatus}`,
        rawBody: JSON.stringify(input.gateway),
        payload: input.gateway as object,
        signature: null,
        status: input.status,
        statusCode: input.statusCode,
        error: input.error ?? null,
        completedAt: input.now,
      },
    });
  } catch (error) {
    console.error("[PAYMENT_RECONCILIATION] No se pudo registrar la conciliación:", error);
  }
}

type Decision =
  | { action: "paid"; transactionId: string | null; gatewayStatus: string; detailsText: string; gateway: unknown }
  | { action: "cancelled"; transactionId: string | null; gatewayStatus: string; detailsText: string; gateway: unknown }
  | { action: "declined"; transactionId: string | null; gatewayStatus: string; detailsText: string; gateway: unknown }
  | { action: "mismatch"; transactionId: string | null; gatewayStatus: string; error: string; gateway: unknown }
  | { action: "none" };

function decideWompi(order: SettlementOrder, transactions: WompiTransaction[], now: Date, windowMs: number): Decision {
  const details = (transaction: WompiTransaction) =>
    `customer_email: ${transaction.customer_email ?? "undefined"} | payment_method_type: ${transaction.payment_method_type ?? "undefined"}`;
  const approved = transactions.filter((transaction) => transaction.status === "APPROVED");
  if (approved.length > 0) {
    const valid = approved.find((transaction) => wompiTransactionMatchesOrder(order, transaction));
    if (valid) return { action: "paid", transactionId: valid.id, gatewayStatus: "APPROVED", detailsText: details(valid), gateway: valid };
    return {
      action: "mismatch",
      transactionId: approved[0].id,
      gatewayStatus: "APPROVED",
      error: `El monto o la moneda de Wompi no coinciden con la orden ${order.orderNumber}`,
      gateway: approved[0],
    };
  }
  if (!transactions.every((transaction) => WOMPI_CANCELLED.has(transaction.status))) return { action: "none" };
  const newest = transactions
    .map((transaction) => ({ transaction, at: parseDate(transaction.finalized_at) ?? parseDate(transaction.created_at) }))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  const at = newest.at ?? order.createdAt.getTime();
  const decision = { transactionId: newest.transaction.id, gatewayStatus: newest.transaction.status, detailsText: details(newest.transaction), gateway: newest.transaction };
  if (now.getTime() - at < windowMs) return newest.transaction.status !== "VOIDED" ? { action: "declined", ...decision } : { action: "none" };
  return { action: "cancelled", ...decision };
}

function decideBold(order: SettlementOrder, voucher: BoldPaymentVoucher, now: Date, windowMs: number): Decision {
  const reference = getBoldOrderReference(order);
  const transactionId = voucher.transaction_id ?? null;
  const details = (status: OrderStatus) => `Bold Transaction ID: ${transactionId} | Reference: ${reference} | Status: ${status}`;
  if (voucher.payment_status === "APPROVED") {
    if (boldAmountMatchesOrder(order, { total: voucher.total, tip: voucher.tip ?? voucher.tip_amount })) {
      return { action: "paid", transactionId, gatewayStatus: "APPROVED", detailsText: details(OrderStatus.PAID), gateway: voucher };
    }
    return { action: "mismatch", transactionId, gatewayStatus: "APPROVED", error: `El monto de Bold no coincide con la orden ${order.orderNumber}`, gateway: voucher };
  }
  if (!BOLD_CANCELLED.has(voucher.payment_status)) return { action: "none" };
  const at = parseDate(voucher.transaction_date) ?? order.createdAt.getTime();
  if (now.getTime() - at < windowMs) {
    return voucher.payment_status === "REJECTED"
      ? { action: "declined", transactionId, gatewayStatus: "REJECTED", detailsText: `Bold Transaction ID: ${transactionId} | Reference: ${reference} | Status: REJECTED`, gateway: voucher }
      : { action: "none" };
  }
  return { action: "cancelled", transactionId, gatewayStatus: voucher.payment_status, detailsText: details(OrderStatus.CANCELLED), gateway: voucher };
}

/** Un pedido pagado se anula solo si la transacción que lo pagó (o, sin ella, todas) quedó VOIDED. */
function decideVoided(provider: Provider, order: SettlementOrder, items: Array<WompiTransaction | BoldPaymentVoucher>): Decision {
  const paidWith = order.payment?.transactionId ?? null;
  if (provider === "Wompi") {
    const transactions = items as WompiTransaction[];
    const target = (paidWith && transactions.find((transaction) => transaction.id === paidWith)) || null;
    const voided = target
      ? target.status === "VOIDED"
      : transactions.length > 0 && !transactions.some((transaction) => transaction.status === "APPROVED") && transactions.some((transaction) => transaction.status === "VOIDED");
    if (!voided) return { action: "none" };
    const transaction = target ?? transactions.find((entry) => entry.status === "VOIDED")!;
    return {
      action: "cancelled",
      transactionId: transaction.id,
      gatewayStatus: "VOIDED",
      detailsText: `customer_email: ${transaction.customer_email ?? "undefined"} | payment_method_type: ${transaction.payment_method_type ?? "undefined"}`,
      gateway: transaction,
    };
  }
  const voucher = items[0] as BoldPaymentVoucher;
  if (voucher.payment_status !== "VOIDED") return { action: "none" };
  const transactionId = voucher.transaction_id ?? null;
  return {
    action: "cancelled",
    transactionId,
    gatewayStatus: "VOIDED",
    detailsText: `Bold Transaction ID: ${transactionId} | Reference: ${getBoldOrderReference(order)} | Status: ${OrderStatus.CANCELLED}`,
    gateway: voucher,
  };
}

function freshState(configured: boolean): ProviderState {
  return { configured, lookups: 0, unavailable: 0, streak: 0, inFlight: 0, skipped: 0, lastUnavailable: null, keyRejected: null, verified: false, probed: false };
}

function describeProvider(provider: Provider, state: ProviderState): { text: string; ok: boolean } {
  if (!state.configured) return { text: `Llave de ${provider} sin configurar`, ok: false };
  if (state.keyRejected !== null) return { text: `Llave de ${provider} rechazada (HTTP ${state.keyRejected})`, ok: false };
  const parts: string[] = [];
  let ok = true;
  if (state.unavailable > 0) {
    const allDown = state.unavailable === state.lookups;
    if (allDown) ok = false;
    parts.push(
      allDown
        ? `${provider} sin respuesta (${state.lastUnavailable})`
        : `${provider} sin respuesta en ${state.unavailable} de ${state.lookups} (${state.lastUnavailable})`,
    );
  }
  if (state.skipped > 0) parts.push(`${state.skipped} de ${provider} sin consultar`);
  if (state.verified) parts.push(`llave de ${provider} verificada${state.probed ? " (sin pedidos pendientes)" : ""}`);
  return { text: parts.join(", ") || `${provider} sin consultar`, ok };
}

/**
 * La conciliación de cada hora: pregunta a la pasarela por los pedidos en
 * línea sin cobrar y aplica lo que diga por el mismo camino que el webhook
 * (`lib/payment-settlement.ts`), así que nunca aplica dos veces. Solo
 * escribe en `PaymentWebhookEvent` cuando algo cambió o no cuadra.
 */
export async function runPaymentReconciliation(deps: ReconciliationDeps): Promise<ReconciliationSummary> {
  const now = deps.now ?? new Date();
  const clock = deps.clock ?? Date.now;
  const startedAt = clock();
  const budget = deps.budgetMs ?? RECONCILE_BUDGET_MS;
  const windowMs = Math.min(deps.declineRetryWindowMs ?? DECLINE_RETRY_WINDOW_MS, DECLINE_RETRY_WINDOW_MS);
  const fetchOptions: GatewayFetchOptions = { fetch: deps.fetch, timeoutMs: deps.timeoutMs };
  const state: Record<Provider, ProviderState> = {
    Wompi: freshState(!!deps.wompi.privateKey && !!deps.wompi.baseUrl),
    Bold: freshState(!!deps.bold.identityKey),
  };
  const counts = { checked: 0, paid: 0, cancelled: 0, unchanged: 0, alreadyApplied: 0, mismatched: 0, failed: 0, rechecked: 0, voided: 0, heldForReview: 0, awaitingRetry: 0 };
  let partial = false;

  const lookup = async (provider: Provider, reference: string): Promise<GatewayLookup<WompiTransaction | BoldPaymentVoucher>> => {
    state[provider].lookups += 1;
    state[provider].inFlight += 1;
    const result = await (provider === "Wompi"
      ? findWompiTransactionsByReference(reference, deps.wompi, fetchOptions)
      : getBoldPaymentVoucher(reference, deps.bold.identityKey, fetchOptions)
    ).finally(() => {
      state[provider].inFlight -= 1;
    });
    if (result.kind === "key-rejected") state[provider].keyRejected = result.status;
    else if (result.kind === "unavailable") {
      state[provider].unavailable += 1;
      state[provider].streak += 1;
      state[provider].lastUnavailable = result.reason;
    } else {
      state[provider].streak = 0;
      state[provider].verified = true;
    }
    return result;
  };

  // Con la pasarela fallando, las consultas en vuelo cuentan como fallos
  // probables: así una caída no dispara las cuatro a la vez una y otra vez.
  const blocked = (provider: Provider) => {
    const current = state[provider];
    return !current.configured || current.keyRejected !== null || (current.streak > 0 && current.streak + current.inFlight >= RECONCILE_UNAVAILABLE_STREAK);
  };

  const reconcileOne = async (order: SettlementOrder) => {
    const provider = providerOf(order);
    if (blocked(provider)) {
      state[provider].skipped += 1;
      return;
    }
    if (clock() - startedAt > budget) {
      partial = true;
      state[provider].skipped += 1;
      return;
    }
    // Preventa con anticipo: se consulta el cobro del anticipo (`-A`) y se
    // juzga contra el anticipo, nunca contra el total del pedido.
    const depositCharge =
      order.paymentPlan === OrderPaymentPlan.DEPOSIT
        ? await prismadb.orderPayment.findFirst({ where: { orderId: order.id, kind: OrderPaymentKind.DEPOSIT } })
        : null;
    if (order.paymentPlan === OrderPaymentPlan.DEPOSIT && !depositCharge?.gatewayReference) {
      counts.unchanged += 1;
      return;
    }
    const reference = depositCharge?.gatewayReference ?? (provider === "Bold" ? getBoldOrderReference(order) : order.id);
    const result = await lookup(provider, reference);
    if (result.kind !== "found" && result.kind !== "none") return;
    counts.checked += 1;
    if (result.kind === "none") {
      counts.unchanged += 1;
      return;
    }
    const judged = depositCharge ? { ...order, total: depositCharge.amount, giftCardAmount: 0 } : order;
    const decision =
      provider === "Wompi"
        ? decideWompi(judged, result.items as WompiTransaction[], now, windowMs)
        : decideBold(judged, result.items[0] as BoldPaymentVoucher, now, windowMs);

    if (decision.action === "none") {
      counts.unchanged += 1;
      return;
    }
    const log = (status: PaymentWebhookEventStatus, statusCode: number, error?: string) =>
      logReconciliation({ provider, order, gatewayStatus: decision.gatewayStatus, transactionId: decision.transactionId, gateway: decision.gateway, status, statusCode, error, now });

    if (decision.action === "mismatch") {
      counts.mismatched += 1;
      // Un pago que no cuadra se registra una vez, no cada hora hasta su tope.
      const seen = await prismadb.paymentWebhookEvent
        .findFirst({ where: { orderId: order.id, eventType: `${RECONCILIATION_EVENT_PREFIX}APPROVED`, status: PaymentWebhookEventStatus.REJECTED }, select: { id: true } })
        .catch(() => null);
      if (seen) return;
      await log(PaymentWebhookEventStatus.REJECTED, 400, decision.error);
      await sendPaymentAlert(
        { provider: WEBHOOK_PROVIDER[provider], kind: "reconcile-mismatch", storeId: order.storeId, orderId: order.id, orderNumber: order.orderNumber, error: decision.error },
        deps.alerts,
      );
      return;
    }

    try {
      if (depositCharge && decision.action === "paid") {
        const voucher = decision.gateway as BoldPaymentVoucher & WompiTransaction;
        const deposit = await processDepositCharge({
          provider,
          charge: depositCharge,
          event: "approved",
          transactionId: decision.transactionId,
          amount: provider === "Bold" ? { total: voucher.total, tip: voucher.tip ?? voucher.tip_amount } : voucher,
          source: "reconciliation",
        });
        if (deposit.body.success !== true) {
          counts.alreadyApplied += 1;
          return;
        }
        await log(PaymentWebhookEventStatus.PROCESSED, 200);
        counts.paid += 1;
        await sendPaymentAlert(
          { provider: WEBHOOK_PROVIDER[provider], kind: "reconcile-applied", storeId: order.storeId, orderId: order.id, orderNumber: order.orderNumber },
          deps.alerts,
        );
        return;
      }
      // Un rechazo del anticipo deja el pedido pendiente para reintentar, sin correo de pago completo.
      if (depositCharge && decision.action === "declined") {
        counts.awaitingRetry += 1;
        return;
      }
      const settlement = { order, provider, transactionId: decision.transactionId, detailsText: decision.detailsText, source: "reconciliation" as const };
      if (decision.action === "declined") {
        // Cubre el rechazo cuyo webhook nunca llegó: el correo sale una vez.
        counts.awaitingRetry += 1;
        const { outcome } = await settleDeclinedPayment(settlement);
        if (outcome === "applied") await log(PaymentWebhookEventStatus.PROCESSED, 200);
        return;
      }
      const { outcome } =
        decision.action === "paid"
          ? await settlePaidPayment(settlement)
          : await settleCancelledPayment({ ...settlement, gatewayStatus: decision.gatewayStatus });
      if (outcome !== "applied") {
        counts.alreadyApplied += 1;
        return;
      }
      await log(PaymentWebhookEventStatus.PROCESSED, 200);
      if (decision.action === "paid") {
        counts.paid += 1;
        await sendPaymentAlert(
          { provider: WEBHOOK_PROVIDER[provider], kind: "reconcile-applied", storeId: order.storeId, orderId: order.id, orderNumber: order.orderNumber },
          deps.alerts,
        );
      } else {
        counts.cancelled += 1;
      }
    } catch (error) {
      counts.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PAYMENT_RECONCILIATION] No se pudo aplicar ${provider} en ${order.orderNumber}:`, error);
      await log(PaymentWebhookEventStatus.FAILED, 500, message);
    }
  };

  const recheckPaidOne = async (order: SettlementOrder) => {
    const provider = providerOf(order);
    if (blocked(provider)) {
      state[provider].skipped += 1;
      return;
    }
    if (clock() - startedAt > budget) {
      partial = true;
      state[provider].skipped += 1;
      return;
    }
    const result = await lookup(provider, provider === "Bold" ? getBoldOrderReference(order) : order.id);
    if (result.kind !== "found" && result.kind !== "none") return;
    counts.rechecked += 1;
    if (result.kind === "none") return;
    const decision = decideVoided(provider, order, result.items as Array<WompiTransaction | BoldPaymentVoucher>);
    if (decision.action !== "cancelled") return;
    const log = (status: PaymentWebhookEventStatus, statusCode: number, error?: string) =>
      logReconciliation({ provider, order, gatewayStatus: decision.gatewayStatus, transactionId: decision.transactionId, gateway: decision.gateway, status, statusCode, error, now });
    try {
      const { outcome, holdReason } = await settleCancelledPayment({
        order,
        provider,
        transactionId: decision.transactionId,
        detailsText: decision.detailsText,
        source: "reconciliation",
        gatewayStatus: decision.gatewayStatus,
      });
      if (outcome === "held") {
        counts.heldForReview += 1;
        // Sigue anulado cada hora de la ventana: una fila y un aviso por pedido.
        const seen = await prismadb.paymentWebhookEvent
          .findFirst({ where: { orderId: order.id, eventType: `${RECONCILIATION_EVENT_PREFIX}VOIDED`, status: PaymentWebhookEventStatus.IGNORED }, select: { id: true } })
          .catch(() => null);
        if (seen) return;
        await log(PaymentWebhookEventStatus.IGNORED, 200, `Pago anulado en la pasarela sobre un pedido ${holdReason === "pickup" ? "para recoger" : "ya despachado"}: queda para revisión`);
        await sendPaymentAlert(
          { provider: WEBHOOK_PROVIDER[provider], kind: "void-held", storeId: order.storeId, orderId: order.id, orderNumber: order.orderNumber, holdReason },
          deps.alerts,
        );
        return;
      }
      if (outcome !== "applied") {
        counts.alreadyApplied += 1;
        return;
      }
      await log(PaymentWebhookEventStatus.PROCESSED, 200);
      counts.voided += 1;
      await sendPaymentAlert(
        { provider: WEBHOOK_PROVIDER[provider], kind: "reconcile-voided", storeId: order.storeId, orderId: order.id, orderNumber: order.orderNumber },
        deps.alerts,
      );
    } catch (error) {
      counts.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PAYMENT_RECONCILIATION] No se pudo anular ${provider} en ${order.orderNumber}:`, error);
      await log(PaymentWebhookEventStatus.FAILED, 500, message);
    }
  };

  // Un pedido que lanza (referencia inválida, base caída) no corta la corrida.
  const reconcileSafely = (order: SettlementOrder) =>
    reconcileOne(order).catch((error) => {
      counts.failed += 1;
      console.error(`[PAYMENT_RECONCILIATION] Falló la conciliación de ${order.orderNumber}:`, error);
    });

  const candidates = await selectReconciliationCandidates(now);
  const byProvider: Record<Provider, SettlementOrder[]> = { Wompi: [], Bold: [] };
  for (const order of candidates) byProvider[providerOf(order)].push(order);

  // La primera consulta de cada pasarela va sola: si la llave está rechazada,
  // no sale ninguna otra en paralelo.
  await Promise.all((["Wompi", "Bold"] as const).map((provider) => (byProvider[provider][0] ? reconcileSafely(byProvider[provider][0]) : undefined)));
  const rest = [...byProvider.Wompi.slice(1), ...byProvider.Bold.slice(1)].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(RECONCILE_CONCURRENCY, rest.length) }, async () => {
      while (next < rest.length) await reconcileSafely(rest[next++]);
    }),
  );

  const reconcileOnlineRow = async (row: OrderPayment) => {
    const provider: Provider = row.method === PaymentMethod.Bold ? "Bold" : "Wompi";
    if (blocked(provider)) {
      state[provider].skipped += 1;
      return;
    }
    if (clock() - startedAt > budget) {
      partial = true;
      state[provider].skipped += 1;
      return;
    }
    const reference = row.gatewayReference!;
    const result = await lookup(provider, reference);
    if (result.kind !== "found" && result.kind !== "none") return;
    counts.checked += 1;
    if (result.kind === "none") {
      counts.unchanged += 1;
      return;
    }
    let approved: { transactionId: string | null; gateway: unknown; amount: { total?: unknown; tip?: unknown; amount_in_cents?: unknown; currency?: unknown } } | null = null;
    let mismatch: unknown = null;
    if (provider === "Wompi") {
      const transactions = (result.items as WompiTransaction[]).filter((transaction) => transaction.status === "APPROVED");
      const match = transactions.find((transaction) => wompiCentsMatchDue(row.amount, transaction));
      if (match) approved = { transactionId: match.id, gateway: match, amount: match };
      else if (transactions.length > 0) mismatch = transactions[0];
    } else {
      const voucher = result.items[0] as BoldPaymentVoucher;
      if (voucher.payment_status === "APPROVED") {
        const amount = { total: voucher.total, tip: voucher.tip ?? voucher.tip_amount };
        if (boldAmountMatchesDue(row.amount, amount)) approved = { transactionId: voucher.transaction_id ?? null, gateway: voucher, amount };
        else mismatch = voucher;
      }
    }
    const order = await prismadb.order.findUnique({ where: { id: row.orderId }, select: { id: true, storeId: true, orderNumber: true } });
    const logRow = (status: PaymentWebhookEventStatus, statusCode: number, gateway: unknown, error?: string) =>
      prismadb.paymentWebhookEvent
        .create({
          data: {
            provider: WEBHOOK_PROVIDER[provider],
            storeId: row.storeId,
            orderId: row.orderId,
            orderReference: reference,
            transactionId: approved?.transactionId ?? null,
            eventType: `${RECONCILIATION_EVENT_PREFIX}APPROVED`,
            rawBody: JSON.stringify(gateway),
            payload: gateway as object,
            signature: null,
            status,
            statusCode,
            error: error ?? null,
            completedAt: now,
          },
        })
        .catch((error) => console.error("[PAYMENT_RECONCILIATION] No se pudo registrar el cobro en línea:", error));
    if (mismatch) {
      counts.mismatched += 1;
      const seen = await prismadb.paymentWebhookEvent
        .findFirst({ where: { orderReference: reference, eventType: `${RECONCILIATION_EVENT_PREFIX}APPROVED`, status: PaymentWebhookEventStatus.REJECTED }, select: { id: true } })
        .catch(() => null);
      if (seen) return;
      const error = `El monto aprobado en ${provider} no coincide con el cobro ${reference}`;
      await logRow(PaymentWebhookEventStatus.REJECTED, 400, mismatch, error);
      await sendPaymentAlert(
        { provider: WEBHOOK_PROVIDER[provider], kind: "reconcile-mismatch", storeId: row.storeId, orderId: row.orderId, orderNumber: order?.orderNumber ?? null, error },
        deps.alerts,
      );
      return;
    }
    // Rechazado o en curso: la fila sigue PENDING y la clienta reintenta con otro cobro.
    if (!approved) {
      counts.unchanged += 1;
      return;
    }
    try {
      const settled = await processDepositCharge({
        provider,
        charge: row,
        event: "approved",
        transactionId: approved.transactionId,
        amount: approved.amount,
        source: "reconciliation",
      });
      if (settled.body.success !== true) {
        counts.alreadyApplied += 1;
        return;
      }
      await logRow(PaymentWebhookEventStatus.PROCESSED, 200, approved.gateway);
      counts.paid += 1;
      await sendPaymentAlert(
        { provider: WEBHOOK_PROVIDER[provider], kind: "reconcile-applied", storeId: row.storeId, orderId: row.orderId, orderNumber: order?.orderNumber ?? null },
        deps.alerts,
      );
    } catch (error) {
      counts.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PAYMENT_RECONCILIATION] No se pudo aplicar el cobro ${reference}:`, error);
      await logRow(PaymentWebhookEventStatus.FAILED, 500, approved.gateway, message);
    }
  };

  const onlineRows = await selectOnlinePreorderCandidates(now);
  let nextOnline = 0;
  await Promise.all(
    Array.from({ length: Math.min(RECONCILE_CONCURRENCY, onlineRows.length) }, async () => {
      while (nextOnline < onlineRows.length) {
        const row = onlineRows[nextOnline++];
        await reconcileOnlineRow(row).catch((error) => {
          counts.failed += 1;
          console.error(`[PAYMENT_RECONCILIATION] Falló la conciliación del cobro ${row.gatewayReference}:`, error);
        });
      }
    }),
  );

  const paidRows = await selectPaidRecheckCandidates(now);
  let nextPaid = 0;
  await Promise.all(
    Array.from({ length: Math.min(RECONCILE_CONCURRENCY, paidRows.length) }, async () => {
      while (nextPaid < paidRows.length) {
        const order = paidRows[nextPaid++];
        await recheckPaidOne(order).catch((error) => {
          counts.failed += 1;
          console.error(`[PAYMENT_RECONCILIATION] Falló la revisión del pago de ${order.orderNumber}:`, error);
        });
      }
    }),
  );

  // Sin nada que consultar, una consulta que no puede coincidir con ningún
  // pedido: una llave mala se ve en la hora siguiente al despliegue.
  for (const provider of ["Wompi", "Bold"] as const) {
    if (state[provider].lookups > 0 || !state[provider].configured) continue;
    state[provider].probed = true;
    await lookup(provider, KEY_PROBE_REFERENCE);
  }

  for (const provider of ["Wompi", "Bold"] as const) {
    const status = state[provider].keyRejected;
    if (status === null) continue;
    await sendPaymentAlert({ provider: WEBHOOK_PROVIDER[provider], kind: "key-rejected", statusCode: status }, deps.alerts).catch((error) =>
      console.error("[PAYMENT_RECONCILIATION] No se pudo avisar la llave rechazada:", error),
    );
  }

  const wompi = describeProvider("Wompi", state.Wompi);
  const bold = describeProvider("Bold", state.Bold);
  const ok = wompi.ok && bold.ok && counts.failed === 0;
  const keyTexts = [wompi, bold].filter((entry) => /rechazada|sin configurar/.test(entry.text)).map((entry) => entry.text);
  const detail = [
    ...keyTexts,
    `Revisados ${counts.checked}`,
    `pagados ${counts.paid}`,
    `cancelados ${counts.cancelled}`,
    `sin cambio ${counts.unchanged}`,
    ...(counts.alreadyApplied > 0 ? [`ya aplicados ${counts.alreadyApplied}`] : []),
    ...(counts.mismatched > 0 ? [`monto distinto ${counts.mismatched}`] : []),
    ...(counts.rechecked > 0 ? [`pagados revisados ${counts.rechecked}`] : []),
    ...(counts.voided > 0 ? [`anulados en la pasarela ${counts.voided}`] : []),
    ...(counts.heldForReview > 0 ? [`anulados por revisar ${counts.heldForReview}`] : []),
    ...(counts.awaitingRetry > 0 ? [`rechazados esperando reintento ${counts.awaitingRetry}`] : []),
    ...(counts.failed > 0 ? [`fallos ${counts.failed}`] : []),
    ...[wompi, bold].filter((entry) => !keyTexts.includes(entry.text)).map((entry) => entry.text),
    ...(partial ? ["parcial: se acabó el tiempo de la corrida"] : []),
  ].join(" · ");

  const gateway = (provider: Provider) => ({
    lookups: state[provider].lookups,
    unavailable: state[provider].unavailable,
    skipped: state[provider].skipped,
    keyRejected: state[provider].keyRejected,
    verified: state[provider].verified,
  });
  return { ok, detail, ...counts, partial, gateways: { Wompi: gateway("Wompi"), Bold: gateway("Bold") } };
}
