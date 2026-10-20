import { OrderStatus } from "@/constants";
import type { Order } from "@/types";

export const ORDER_STATUS_POLL_INTERVAL_MS = 10_000;

export function shouldPollOrderStatus(status: string, isVisible: boolean) {
  return (
    isVisible &&
    (status === OrderStatus.CREATED || status === OrderStatus.PENDING)
  );
}

/**
 * El sondeo no lleva siempre la misma vista que trajo la página: sin sesión
 * la administración responde el recibo recortado. De ese cuerpo solo se toma
 * el avance (estado del pago y del envío); los datos completos que ya están en
 * pantalla no se cambian por los recortados.
 */
export function mergePolledOrder(current: Order, fetched: Order): Order {
  if (!fetched.masked || current.masked) return fetched;
  return {
    ...current,
    status: fetched.status,
    paymentResult: fetched.paymentResult,
    paidAt: fetched.paidAt,
    shipping:
      current.shipping && fetched.shipping
        ? {
            ...current.shipping,
            status: fetched.shipping.status,
            updatedAt: fetched.shipping.updatedAt ?? current.shipping.updatedAt,
          }
        : current.shipping,
  };
}
