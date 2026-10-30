import { OrderStatus } from "@/constants";
import type { Order, PreorderPaymentInfo } from "@/types";

/**
 * Abonos y saldo pagados desde `/pedido`. El pedido sigue «Anticipo
 * recibido» después de un abono, así que el estado no dice nada: lo que
 * cambia es lo pagado y el cobro `-P<n>` con el que volvió de la pasarela.
 */

type Params = Pick<URLSearchParams, "get">;

/** La referencia del cobro con el que vuelve de la pasarela (`?pago=<orderNumber>-P<n>`). */
export function onlinePaymentReturn(params: Params): string | null {
  const reference = params.get("pago");
  return reference && /-P\d+$/.test(reference) ? reference : null;
}

export type OnlinePaymentResult = "approved" | "pending";

/** Aprobado solo si la administración ya aprobó ese mismo cobro; si no, sigue en confirmación. */
export function onlinePaymentResult(order: Pick<Order, "preorderPayment">, reference: string): OnlinePaymentResult {
  const row = order.preorderPayment?.onlinePayments.find((payment) => payment.reference === reference);
  return row?.status === "APPROVED" ? "approved" : "pending";
}

export function returnedPayment(order: Pick<Order, "preorderPayment">, reference: string) {
  return order.preorderPayment?.onlinePayments.find((payment) => payment.reference === reference) ?? null;
}

/** Con un abono o un saldo en confirmación, la página sigue preguntando aunque el estado no cambie. */
export function shouldPollPreorderPayment(order: Pick<Order, "status" | "preorderPayment">, returnReference: string | null, isVisible: boolean): boolean {
  if (!isVisible || order.status !== OrderStatus.DEPOSIT_PAID) return false;
  if (returnReference && onlinePaymentResult(order, returnReference) !== "approved") return true;
  return Boolean(order.preorderPayment?.onlinePayments.some((payment) => payment.status === "PENDING"));
}

/** Lo que cambió en la plata: lo pagado, lo que se puede pagar o el estado de un cobro. */
export function preorderMoneyChanged(current: Pick<Order, "paidSoFar" | "preorderPayment">, fetched: Pick<Order, "paidSoFar" | "preorderPayment">): boolean {
  return current.paidSoFar !== fetched.paidSoFar || JSON.stringify(current.preorderPayment ?? null) !== JSON.stringify(fetched.preorderPayment ?? null);
}

/** El valor que la clienta escribe, en pesos enteros; null si no es un número. */
export function parsePesos(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isSafeInteger(value) ? value : null;
}

/** El mismo límite que aplica el servidor, para avisar antes de ir a la pasarela. */
export function installmentProblem(info: Pick<PreorderPaymentInfo, "minAmount" | "amountDue">, amount: number | null): string | null {
  if (amount === null || amount <= 0) return "Escribe cuánto quieres abonar.";
  if (amount < info.minAmount) return `El abono mínimo es $ ${info.minAmount.toLocaleString("es-CO")}.`;
  if (amount > info.amountDue) return `Falta $ ${info.amountDue.toLocaleString("es-CO")}: el abono no puede pasar de ahí.`;
  return null;
}
