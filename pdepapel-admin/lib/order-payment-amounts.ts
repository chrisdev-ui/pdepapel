import { OrderPaymentKind, OrderPaymentPlan, OrderPaymentStatus, OrderStatus } from "@prisma/client";

import { getAmountDue } from "@/lib/gift-card-amounts";

/**
 * Montos y referencias de los pedidos con anticipo, sin dependencias de
 * servidor: los usan los correos, las pasarelas y la conciliación.
 */

export const DEPOSIT_REFERENCE_SUFFIX = "-A";
export const BALANCE_REFERENCE_SUFFIX = "-S";

export function depositChargeReference(orderNumber: string): string {
  return `${orderNumber}${DEPOSIT_REFERENCE_SUFFIX}`;
}

export function balanceChargeReference(orderNumber: string): string {
  return `${orderNumber}${BALANCE_REFERENCE_SUFFIX}`;
}

/** Lo que ya entró antes del saldo: los anticipos aprobados. */
export function sumPrepaid(payments: ReadonlyArray<{ kind: OrderPaymentKind; status: OrderPaymentStatus; amount: number }> | null | undefined): number {
  return (payments ?? [])
    .filter((payment) => payment.kind === OrderPaymentKind.DEPOSIT && payment.status === OrderPaymentStatus.APPROVED)
    .reduce((sum, payment) => sum + Math.round(Number(payment.amount)), 0);
}

export interface AmountDueOrder {
  total: number;
  giftCardAmount?: number | null;
  paymentPlan?: OrderPaymentPlan | null;
  status?: OrderStatus | null;
  depositAmount?: number | null;
}

/**
 * Lo que se le cobra HOY a la clienta. Un pedido normal: el total menos la
 * tarjeta de regalo (`getAmountDue`). Con anticipo: el anticipo mientras está
 * pendiente; el saldo (total − anticipos aprobados) con el anticipo recibido;
 * nada una vez pagado.
 */
export function getAmountDueNow(order: AmountDueOrder, approvedDeposits = 0): number {
  if (order.paymentPlan !== OrderPaymentPlan.DEPOSIT) return getAmountDue(order);
  if (!order.status || order.status === OrderStatus.CREATED || order.status === OrderStatus.PENDING) {
    return Math.max(0, Math.round(Number(order.depositAmount ?? 0)));
  }
  if (order.status === OrderStatus.DEPOSIT_PAID) {
    return Math.max(0, Math.round(getAmountDue(order) - approvedDeposits));
  }
  return 0;
}

/** El cobro de Bold contra lo que se firmó; la misma tolerancia de propina que `boldAmountMatchesOrder`. */
export function boldAmountMatchesDue(
  due: number,
  amount: { total: unknown; tip?: unknown },
  tolerance = 0.2,
): boolean {
  if (amount.total === undefined || amount.total === null || amount.total === "") return false;
  const total = Number(amount.total);
  if (!Number.isFinite(total)) return false;
  if (process.env.BOLD_ENVIRONMENT === "test" && total === 0) return true;
  const expected = Math.round(due);
  const tip = amount.tip === undefined || amount.tip === null || amount.tip === "" ? NaN : Number(amount.tip);
  if (Number.isFinite(tip) && tip >= 0) return Math.round(total - tip) === expected;
  const paid = Math.round(total);
  if (paid === expected) return true;
  return paid > expected && paid - expected <= expected * tolerance;
}

export function wompiCentsMatchDue(due: number, transaction: { amount_in_cents?: unknown; currency?: unknown } | null | undefined): boolean {
  const cents = Number(transaction?.amount_in_cents);
  if (!Number.isFinite(cents) || Math.round(cents) !== Math.round(due * 100)) return false;
  const currency = transaction?.currency;
  return !currency || currency === "COP";
}

