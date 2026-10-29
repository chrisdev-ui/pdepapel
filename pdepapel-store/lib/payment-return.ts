import { OrderStatus, PaymentMethod } from "@/constants";
import type { Order, PaymentResult } from "@/types";

export const PAYMENT_RETURN_POLL_INTERVAL_MS = 3_000;
export const PAYMENT_RETURN_WINDOW_MS = 60_000;

type Params = Pick<URLSearchParams, "get" | "has">;

/**
 * La visita viene de la pasarela: Wompi agrega `id` y Bold `bold-order-id` y
 * `bold-tx-status`. Solo se usan como marca; el resultado lo dice la
 * administración, nunca lo que la pasarela puso en la URL.
 */
export function isPaymentReturn(params: Params): boolean {
  return Boolean(
    params.get("id") || params.has("bold-order-id") || params.has("bold-tx-status"),
  );
}

export function resolvePaymentResult(
  order: Pick<Order, "status" | "paymentResult">,
): PaymentResult {
  if (order.paymentResult) return order.paymentResult;
  // El anticipo de una preventa es un pago aprobado: lo que falta se cobra al llegar.
  if (order.status === OrderStatus.PAID || order.status === OrderStatus.DEPOSIT_PAID) return "approved";
  if (order.status === OrderStatus.CANCELLED || order.status === "REJECTED") return "declined";
  return "pending";
}

/** Contra entrega se paga al recibir: volver a la página nunca es un aviso de pago. */
export const isCashOnDelivery = (order: Pick<Order, "payment">) =>
  order.payment?.method === PaymentMethod.COD;

const noticeKey = (orderId: string, result: PaymentResult) =>
  `pdepapel:aviso-pago:${orderId}:${result}`;

export function wasPaymentNoticeShown(orderId: string, result: PaymentResult) {
  try {
    return window.sessionStorage.getItem(noticeKey(orderId, result)) === "1";
  } catch {
    return false;
  }
}

export function rememberPaymentNotice(orderId: string, result: PaymentResult) {
  try {
    window.sessionStorage.setItem(noticeKey(orderId, result), "1");
  } catch {
    // Sin almacenamiento el aviso puede repetirse al recargar; no es grave.
  }
}
