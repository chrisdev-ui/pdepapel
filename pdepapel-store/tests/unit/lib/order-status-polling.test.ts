import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/constants";
import {
  mergePolledOrder,
  ORDER_STATUS_POLL_INTERVAL_MS,
  shouldPollOrderStatus,
} from "@/lib/order-status-polling";

import { fullReceiptOrder, maskedReceiptOrder } from "../../fixtures/receipt-orders";

describe("order status polling", () => {
  it("limits pending-payment refreshes to a visible tab", () => {
    expect(ORDER_STATUS_POLL_INTERVAL_MS).toBe(10_000);
    expect(shouldPollOrderStatus(OrderStatus.CREATED, true)).toBe(true);
    expect(shouldPollOrderStatus(OrderStatus.PENDING, true)).toBe(true);
    expect(shouldPollOrderStatus(OrderStatus.PENDING, false)).toBe(false);
  });

  it("stops refreshing after the payment reaches a final state", () => {
    expect(shouldPollOrderStatus(OrderStatus.PAID, true)).toBe(false);
    expect(shouldPollOrderStatus(OrderStatus.CANCELLED, true)).toBe(false);
  });
});

describe("mezclar lo que trae el sondeo", () => {
  it("un recibo completo no se cambia por uno recortado: solo avanza el estado", () => {
    const current = fullReceiptOrder({ status: OrderStatus.PENDING, paymentResult: "pending", paidAt: null });
    const fetched = maskedReceiptOrder({
      status: OrderStatus.PAID,
      paymentResult: "approved",
      shipping: { ...maskedReceiptOrder().shipping!, status: "Preparing" },
    });

    const merged = mergePolledOrder(current, fetched);

    expect(merged).toMatchObject({
      status: OrderStatus.PAID,
      paymentResult: "approved",
      paidAt: fetched.paidAt,
      fullName: "Ana María Prueba",
      address: "Calle Prueba 1",
      phone: "+573000000000",
      giftMessage: "Mensaje de prueba",
      masked: false,
    });
    expect(merged.shipping?.status).toBe("Preparing");
    expect(merged.shipping?.trackingCode).toBe("GUIA-PRUEBA-1");
  });

  it("si la página ya tenía el recortado, o llega el completo, se toma lo nuevo", () => {
    const masked = maskedReceiptOrder({ status: OrderStatus.PAID });
    expect(mergePolledOrder(maskedReceiptOrder({ status: OrderStatus.PENDING }), masked)).toBe(masked);

    const full = fullReceiptOrder({ status: OrderStatus.PAID });
    expect(mergePolledOrder(fullReceiptOrder({ status: OrderStatus.PENDING }), full)).toBe(full);
  });
});
