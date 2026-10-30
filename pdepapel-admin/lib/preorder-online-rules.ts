import { OrderPaymentKind, OrderPaymentPlan, OrderPaymentStatus, OrderStatus } from "@prisma/client";

import { getAmountDueNow, sumReceived } from "@/lib/order-payment-amounts";

/**
 * Qué puede pagar en línea, desde `/pedido`, una clienta con anticipo. Puro:
 * lo usan la ruta pública (que vuelve a decidir al cobrar), el webhook, la
 * conciliación y el pedido que ve la tienda.
 *
 * - Mientras la preventa espera: **abonar** cualquier valor entre el mínimo y
 *   lo que falta del producto (sin envío, que todavía no existe).
 * - Ya liberada y con el saldo pedido (`balanceRequestedAt`: Paula puso el
 *   envío y le avisó): **pagar el saldo** exacto, producto + envío − pagado.
 * - Liberada sin saldo pedido, «sin unidad», cancelada o ya pagada: nada.
 */

/** Cada cobro en línea lleva su propia referencia: `<orderNumber>-P<n>`, nunca la del anticipo. */
export const ONLINE_REFERENCE_PATTERN = /-P\d+$/;

export function onlineChargeReference(orderNumber: string, sequence: number): string {
  return `${orderNumber}-P${sequence}`;
}

/** El abono más pequeño que se cobra en línea; si falta menos, se cobra lo que falta. */
export const MIN_ONLINE_INSTALLMENT = 10_000;

export type OnlinePaymentMode = "installment" | "balance";

export type OnlinePaymentBlock = "not-deposit" | "not-deposit-paid" | "unfulfilled" | "awaiting-balance-request" | "nothing-due";

export interface OnlinePaymentState {
  mode: OnlinePaymentMode | null;
  /** Lo que falta: sin envío mientras espera; con el envío ya pedido el saldo. */
  amountDue: number;
  /** El abono mínimo (o lo que falta, si es menos). Igual a `amountDue` para el saldo. */
  minAmount: number;
  paid: number;
  block: OnlinePaymentBlock | null;
}

export interface OnlinePaymentOrder {
  status: OrderStatus;
  paymentPlan: OrderPaymentPlan | null;
  total: number;
  giftCardAmount?: number | null;
  depositAmount?: number | null;
  balanceRequestedAt?: Date | string | null;
  orderItems: { isPreorder: boolean; preorderReleasedAt: Date | string | null; preorderUnfulfilledAt?: Date | string | null }[];
  payments: { kind: OrderPaymentKind; status: OrderPaymentStatus; amount: number }[];
}

const none = (block: OnlinePaymentBlock, paid = 0): OnlinePaymentState => ({ mode: null, amountDue: 0, minAmount: 0, paid, block });

export function onlinePaymentState(order: OnlinePaymentOrder): OnlinePaymentState {
  if (order.paymentPlan !== OrderPaymentPlan.DEPOSIT) return none("not-deposit");
  const paid = sumReceived(order.payments);
  if (order.status !== OrderStatus.DEPOSIT_PAID) return none("not-deposit-paid", paid);
  const waiting = order.orderItems.filter((item) => item.isPreorder && !item.preorderReleasedAt);
  if (waiting.some((item) => Boolean(item.preorderUnfulfilledAt))) return none("unfulfilled", paid);
  const due = getAmountDueNow({ ...order, total: Number(order.total) }, paid);
  if (waiting.length > 0) {
    if (due <= 0) return none("nothing-due", paid);
    return { mode: "installment", amountDue: due, minAmount: Math.min(MIN_ONLINE_INSTALLMENT, due), paid, block: null };
  }
  if (!order.balanceRequestedAt) return none("awaiting-balance-request", paid);
  if (due <= 0) return none("nothing-due", paid);
  return { mode: "balance", amountDue: due, minAmount: due, paid, block: null };
}

/** El valor que pide la clienta, contra lo que hoy se puede cobrar. Devuelve el error para mostrar, o null. */
export function checkOnlineAmount(state: OnlinePaymentState, mode: OnlinePaymentMode, amount: number): string | null {
  if (state.mode !== mode) {
    if (state.block === "unfulfilled") return "Esta preventa no alcanzó tu unidad: no hay nada que pagar. Te escribimos para la devolución.";
    if (state.block === "awaiting-balance-request") return "Tu producto ya llegó: estamos cotizando el envío y te escribimos con el saldo.";
    if (state.block === "nothing-due") return "Ya pagaste todo lo que falta por ahora.";
    return mode === "balance" ? "El saldo se paga cuando llegue el producto." : "Este pedido ya no recibe abonos en línea.";
  }
  if (!Number.isInteger(amount) || amount <= 0) return "Escribe un valor en pesos, sin decimales.";
  if (mode === "balance") return amount === state.amountDue ? null : `El saldo es ${formatPesos(state.amountDue)}.`;
  if (amount < state.minAmount) return `El abono mínimo es ${formatPesos(state.minAmount)}.`;
  if (amount > state.amountDue) return `Falta ${formatPesos(state.amountDue)}: el abono no puede pasar de ahí.`;
  return null;
}

export const ONLINE_PAYMENT_KIND: Record<OnlinePaymentMode, OrderPaymentKind> = {
  installment: OrderPaymentKind.INSTALLMENT,
  balance: OrderPaymentKind.BALANCE,
};

function formatPesos(value: number): string {
  return `$ ${Math.round(value).toLocaleString("es-CO")}`;
}
