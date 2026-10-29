import {
  NotificationChannel,
  OrderInventoryIssueKind,
  OrderNotificationStatus,
  OrderPaymentKind,
  OrderPaymentPlan,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  type Prisma,
} from "@prisma/client";

import { ErrorFactory } from "@/lib/api-errors";
import { runInBackground } from "@/lib/background";
import { invalidateStoreProductsCache } from "@/lib/cache";
import { withDeadlockRetry } from "@/lib/deadlock-retry";
import { sendOrderEmail } from "@/lib/email";
import { calculateOrderFinancials } from "@/lib/financial";
import { BALANCE_REFERENCE_SUFFIX, DEPOSIT_REFERENCE_SUFFIX, getAmountDueNow } from "@/lib/order-payment-amounts";
import { recordDepositInGoogleAnalytics, recordPaidOrderInGoogleAnalytics } from "@/lib/google-analytics";
import { createInventoryMovementBatchResilient } from "@/lib/inventory";
import { recordInventoryIssues } from "@/lib/order-inventory-issues";
import { explodeKitMovements } from "@/lib/order-stock-movements";
import { isUnreleasedPreorderLine, stockLinesOnPayment } from "@/lib/presale";
import prismadb from "@/lib/prismadb";
import { saleMovementType } from "@/lib/sale-movement-type";
import { silentChangeDedupeKey, silentChangeMilestone } from "@/lib/silent-status-change";

/**
 * Preventa con anticipo: un pedido que se cobra en dos partes.
 *
 * - `Order.total` es siempre el valor completo; lo que se cobra hoy sale de
 *   `getAmountDueNow`. Cada cobro queda en `OrderPayment` con su propia
 *   referencia de pasarela (`<orderNumber>-A` el anticipo, `-S` el saldo).
 * - **Anticipo** (PENDING → DEPOSIT_PAID): mueve el inventario igual que un
 *   pago (la línea de preventa suma cupo; si la campaña ya se liberó,
 *   descuenta), pero NO es venta: sin `paidAt`, sin financieros, sin GA4
 *   `purchase`. Nunca pasa por `settlePaidPayment`.
 * - **Saldo** (DEPOSIT_PAID → PAID): el inventario ya se movió con el anticipo
 *   y al liberar, así que aquí no se toca. Es la venta: `paidAt`,
 *   financieros, GA4 `purchase`.
 */

export {
  BALANCE_REFERENCE_SUFFIX,
  DEPOSIT_REFERENCE_SUFFIX,
  balanceChargeReference,
  boldAmountMatchesDue,
  depositChargeReference,
  getAmountDueNow,
  wompiCentsMatchDue,
  type AmountDueOrder,
} from "@/lib/order-payment-amounts";
/** «Anticipo registrado sin avisar» en «Avisos a la clienta». */
export const DEPOSIT_SILENT_REASON = "Anticipo registrado sin avisar";
export const BALANCE_SILENT_REASON = "Saldo registrado sin avisar";

/** El cobro al que apunta una referencia de pasarela, si es de un pedido con anticipo. */
export async function findChargeByReference(reference: string | null | undefined, storeId?: string | null) {
  // Solo las referencias de un cobro (`-A`/`-S`): las de siempre (número o id del pedido) no se buscan aquí.
  if (!reference || !(reference.endsWith(DEPOSIT_REFERENCE_SUFFIX) || reference.endsWith(BALANCE_REFERENCE_SUFFIX))) return null;
  return prismadb.orderPayment.findFirst({
    where: { gatewayReference: reference, ...(storeId ? { storeId } : {}) },
  });
}

/** `notifyCustomer` del cuerpo para anticipo y saldo: ausente es `false` (al revés que `parseNotifyCustomer`). */
export function parseNotifyCustomerDefaultOff(body: unknown): boolean | null {
  if (!body || typeof body !== "object" || !("notifyCustomer" in body)) return false;
  const value = (body as { notifyCustomer?: unknown }).notifyCustomer;
  if (value === undefined) return false;
  return typeof value === "boolean" ? value : null;
}

type Tx = Prisma.TransactionClient;

const ORDER_FOR_PAYMENT = {
  orderItems: { include: { product: true } },
  payment: true,
  shipping: { select: { id: true, cost: true, codFee: true } },
} satisfies Prisma.OrderInclude;

async function recordSilentPaymentNotice(orderId: string, storeId: string, status: OrderStatus, reason: string, createdBy: string) {
  try {
    const shipping = await prismadb.shipping.findUnique({ where: { orderId }, select: { id: true } });
    await prismadb.orderNotification.create({
      data: {
        storeId,
        orderId,
        shippingId: shipping?.id ?? null,
        milestone: silentChangeMilestone(status),
        channel: NotificationChannel.EMAIL,
        role: "customer",
        status: OrderNotificationStatus.SKIPPED,
        reason,
        createdBy,
        dedupeKey: silentChangeDedupeKey(orderId),
      },
    });
  } catch (error) {
    console.error("[ORDER_PAYMENTS] No se pudo anotar el aviso omitido:", { orderId, error });
  }
}

export type DepositSource = "webhook" | "reconciliation" | "manual";

export interface DepositInput {
  orderId: string;
  storeId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  source: DepositSource;
  /** Clerk id de quien lo anota, o `SYSTEM_BOLD`/`SYSTEM_WOMPI`. */
  createdBy: string;
  transactionId?: string | null;
  /** El cobro PENDING que dejó el checkout (webhook y conciliación). */
  chargeId?: string | null;
  note?: string | null;
  /** Manual: solo con la casilla «Avisar a la clienta». Pasarela: siempre (la clienta acaba de pagar). */
  notifyCustomer: boolean;
}

export type DepositOutcome =
  | { outcome: "applied"; paymentId: string; stockShortfall: number }
  | { outcome: "already"; paymentId: string | null }
  | { outcome: "late-on-cancelled" };

/**
 * Anticipo recibido. Un solo candado: el `updateMany` PENDING → DEPOSIT_PAID
 * dentro de la transacción; quien llega segundo (webhook repetido, conciliación
 * después del webhook, un doble clic) ve `count = 0` y no vuelve a mover nada.
 */
export async function settleDepositPayment(input: DepositInput): Promise<DepositOutcome> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw ErrorFactory.InvalidRequest("El anticipo tiene que ser mayor que cero");

  const result = await withDeadlockRetry(() =>
    prismadb.$transaction(async (tx: Tx) => {
      const claim = await tx.order.updateMany({
        where: {
          id: input.orderId,
          storeId: input.storeId,
          paymentPlan: OrderPaymentPlan.DEPOSIT,
          status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
        },
        data: { status: OrderStatus.DEPOSIT_PAID, depositPaidAt: input.paidAt },
      });
      if (claim.count === 0) {
        const current = await tx.order.findFirst({
          where: { id: input.orderId, storeId: input.storeId },
          select: { status: true, payments: { where: { kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.APPROVED }, select: { id: true }, take: 1 } },
        });
        if (current?.status === OrderStatus.CANCELLED) return { outcome: "late-on-cancelled" as const };
        return { outcome: "already" as const, paymentId: current?.payments[0]?.id ?? null };
      }

      const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId }, include: ORDER_FOR_PAYMENT });

      const paymentData = {
        status: OrderPaymentStatus.APPROVED,
        amount,
        method: input.method,
        paidAt: input.paidAt,
        transactionId: input.transactionId ?? null,
        note: input.note ?? null,
      };
      const pending = input.chargeId
        ? await tx.orderPayment.findFirst({ where: { id: input.chargeId, orderId: order.id, kind: OrderPaymentKind.DEPOSIT } })
        : await tx.orderPayment.findFirst({ where: { orderId: order.id, kind: OrderPaymentKind.DEPOSIT, status: OrderPaymentStatus.PENDING } });
      const payment = pending
        ? await tx.orderPayment.update({ where: { id: pending.id }, data: { ...paymentData, createdBy: pending.createdBy === "SYSTEM" ? input.createdBy : pending.createdBy } })
        : await tx.orderPayment.create({
            data: { ...paymentData, storeId: order.storeId, orderId: order.id, kind: OrderPaymentKind.DEPOSIT, createdBy: input.createdBy },
          });

      // Igual que un pago: la línea de preventa sin liberar suma cupo y no
      // descuenta; una ya liberada (anticipo tardío) y cualquier línea normal sí.
      const lines = await stockLinesOnPayment(tx, order.id, order.orderItems);
      const movements = await explodeKitMovements(
        tx,
        lines
          .filter((item) => item.product)
          .map((item) => ({
            productId: item.productId!,
            storeId: order.storeId,
            type: saleMovementType(order.type),
            quantity: -item.quantity,
            reason: `Anticipo de preventa del pedido ${order.orderNumber}`,
            referenceId: order.id,
            cost: Number(item.product!.acqPrice) || 0,
            price: Number(item.product!.price),
            createdBy: input.createdBy,
          })),
      );
      const stock = await createInventoryMovementBatchResilient(tx, movements);
      const stockShortfall = stock.failed.length
        ? await recordInventoryIssues(tx, {
            storeId: order.storeId,
            orderId: order.id,
            orderNumber: order.orderNumber,
            kind: OrderInventoryIssueKind.DECREMENT,
            failed: stock.failed,
          })
        : 0;

      if (input.source !== "manual" && order.payment) {
        await tx.paymentDetails.update({
          where: { orderId: order.id },
          data: { transactionId: input.transactionId ?? order.payment.transactionId },
        });
      }
      return { outcome: "applied" as const, paymentId: payment.id, stockShortfall };
    }),
  );

  if (result.outcome !== "applied") return result;

  await invalidateStoreProductsCache(input.storeId, { orderIds: [input.orderId] });
  runInBackground("GA4 anticipo de preventa", () => recordDepositInGoogleAnalytics(input.orderId));
  if (input.notifyCustomer) {
    runInBackground("correo de anticipo recibido", () => sendOrderEmail(input.orderId, OrderStatus.DEPOSIT_PAID));
  } else {
    await recordSilentPaymentNotice(input.orderId, input.storeId, OrderStatus.DEPOSIT_PAID, DEPOSIT_SILENT_REASON, input.createdBy);
  }
  return result;
}

export interface BalanceInput {
  orderId: string;
  storeId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  createdBy: string;
  /** El envío que se cobra con el saldo; se suma al total. Null: sin cambio. */
  shippingCost?: number | null;
  note?: string | null;
  notifyCustomer: boolean;
}

/**
 * «Marcar saldo recibido»: DEPOSIT_PAID → PAID. Solo con la preventa ya
 * liberada (el saldo se cobra cuando llega la mercancía) y con el valor
 * exacto que falta, para que lo cobrado cuadre con el total.
 */
export async function settleBalancePayment(input: BalanceInput): Promise<{ outcome: "applied" | "already"; paymentId: string | null }> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount < 0) throw ErrorFactory.InvalidRequest("El saldo no es un valor válido");
  const shippingCost = input.shippingCost === null || input.shippingCost === undefined ? null : Math.round(Number(input.shippingCost));
  if (shippingCost !== null && (!Number.isFinite(shippingCost) || shippingCost < 0)) {
    throw ErrorFactory.InvalidRequest("El envío no es un valor válido");
  }

  const result = await withDeadlockRetry(() =>
    prismadb.$transaction(async (tx: Tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.orderId, storeId: input.storeId },
        include: { ...ORDER_FOR_PAYMENT, payments: true },
      });
      if (!order) throw ErrorFactory.NotFound("El pedido no existe en esta tienda");
      if (order.status === OrderStatus.PAID || order.status === OrderStatus.SENT) {
        return { outcome: "already" as const, paymentId: order.payments.find((p) => p.kind === OrderPaymentKind.BALANCE && p.status === OrderPaymentStatus.APPROVED)?.id ?? null };
      }
      if (order.status !== OrderStatus.DEPOSIT_PAID) {
        throw ErrorFactory.InvalidRequest("El saldo solo se registra en un pedido con anticipo recibido");
      }
      if (order.orderItems.some(isUnreleasedPreorderLine)) {
        throw ErrorFactory.Conflict("Primero libera la preventa en Preventas: el saldo se cobra cuando llega la mercancía.");
      }

      const previousShipping = Math.round(Number(order.shipping?.cost ?? 0));
      const newShipping = shippingCost ?? previousShipping;
      const total = Math.round(Number(order.total)) - previousShipping + newShipping;
      const deposits = order.payments
        .filter((p) => p.kind === OrderPaymentKind.DEPOSIT && p.status === OrderPaymentStatus.APPROVED)
        .reduce((sum, p) => sum + p.amount, 0);
      const due = getAmountDueNow({ ...order, total }, deposits);
      if (amount !== due) {
        throw ErrorFactory.InvalidRequest(`El saldo que falta es ${due.toLocaleString("es-CO")} pesos: revisa el valor o el envío.`);
      }

      const claim = await tx.order.updateMany({
        where: { id: order.id, status: OrderStatus.DEPOSIT_PAID },
        data: { status: OrderStatus.PAID, paidAt: input.paidAt, total },
      });
      if (claim.count === 0) return { outcome: "already" as const, paymentId: null };

      const payment = await tx.orderPayment.create({
        data: {
          storeId: order.storeId,
          orderId: order.id,
          kind: OrderPaymentKind.BALANCE,
          status: OrderPaymentStatus.APPROVED,
          amount,
          method: input.method,
          paidAt: input.paidAt,
          createdBy: input.createdBy,
          note: input.note ?? null,
        },
      });

      const financials = await calculateOrderFinancials(
        { ...order, total } as never,
        order.payment?.method ?? input.method,
        newShipping + Number(order.shipping?.codFee ?? 0),
        tx,
      );
      await tx.order.update({ where: { id: order.id }, data: financials as never });
      // Solo el valor del envío cobrado con el saldo; el estado del envío no cambia.
      if (order.shipping && shippingCost !== null) {
        await tx.shipping.update({ where: { id: order.shipping.id }, data: { cost: shippingCost } });
      }
      return { outcome: "applied" as const, paymentId: payment.id };
    }),
  );

  if (result.outcome !== "applied") return result;

  await invalidateStoreProductsCache(input.storeId, { orderIds: [input.orderId] });
  runInBackground("GA4 compra al pagar el saldo", () => recordPaidOrderInGoogleAnalytics(input.orderId));
  if (input.notifyCustomer) {
    runInBackground("correo de saldo recibido", () => sendOrderEmail(input.orderId, OrderStatus.PAID));
  } else {
    await recordSilentPaymentNotice(input.orderId, input.storeId, OrderStatus.PAID, BALANCE_SILENT_REASON, input.createdBy);
  }
  return result;
}

export { ensurePendingDepositCharge, resolveGatewayCharge } from "@/lib/order-payment-charges";

// --- Anticipo y saldo a mano (panel) ------------------------------------------

/** Medios con los que Paula anota a mano un anticipo o un saldo. */
export const MANUAL_PAYMENT_METHODS: PaymentMethod[] = [PaymentMethod.BankTransfer, PaymentMethod.CASH, PaymentMethod.Bold, PaymentMethod.Wompi];

export interface ManualPaymentBody {
  amount: number;
  paidAt: Date;
  method: PaymentMethod;
  note: string | null;
  notifyCustomer: boolean;
}

/**
 * El cuerpo de «Marcar anticipo/saldo recibido»: valor en pesos, fecha (no en
 * el futuro), medio, nota y la casilla «Avisar a la clienta» (apagada si no
 * llega).
 */
export function parseManualPaymentBody(body: unknown, now = new Date()): ManualPaymentBody {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const amount = Math.round(Number(raw.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw ErrorFactory.InvalidRequest("Pon el valor que recibiste");
  const paidAt = raw.paidAt ? new Date(String(raw.paidAt)) : now;
  if (Number.isNaN(paidAt.getTime())) throw ErrorFactory.InvalidRequest("La fecha del pago no es válida");
  if (paidAt.getTime() > now.getTime() + 5 * 60_000) throw ErrorFactory.InvalidRequest("La fecha del pago no puede estar en el futuro");
  const method = raw.method as PaymentMethod;
  if (!MANUAL_PAYMENT_METHODS.includes(method)) throw ErrorFactory.InvalidRequest("Elige cómo te pagaron");
  const note = typeof raw.note === "string" && raw.note.trim() ? raw.note.trim().slice(0, 500) : null;
  const notifyCustomer = parseNotifyCustomerDefaultOff(raw);
  if (notifyCustomer === null) throw ErrorFactory.InvalidRequest("«Avisar a la clienta» tiene que ser sí o no");
  return { amount, paidAt, method, note, notifyCustomer };
}
