import { OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { getPaymentResult, receiptMeta } from "@/lib/public-orders";

/** El aviso de la tienda al volver de la pasarela sale del estado del pedido, no del id de la transacción. */
describe("getPaymentResult", () => {
  it("pagado o enviado → aprobado; cancelado o rechazado → rechazado; lo demás → pendiente", () => {
    expect(getPaymentResult(OrderStatus.PAID)).toBe("approved");
    expect(getPaymentResult(OrderStatus.SENT)).toBe("approved");
    expect(getPaymentResult(OrderStatus.CANCELLED)).toBe("declined");
    expect(getPaymentResult(OrderStatus.REJECTED)).toBe("declined");
    for (const status of [OrderStatus.PENDING, OrderStatus.CREATED, OrderStatus.DRAFT, OrderStatus.QUOTATION, OrderStatus.VIEWED, OrderStatus.ACCEPTED]) {
      expect(getPaymentResult(status)).toBe("pending");
    }
  });

  it("todavía no se enmascara nada", () => {
    expect(receiptMeta(OrderStatus.PAID)).toEqual({ paymentResult: "approved", masked: false });
  });
});
