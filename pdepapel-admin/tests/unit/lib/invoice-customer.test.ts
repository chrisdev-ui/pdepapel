import { describe, expect, it } from "vitest";

import { FINAL_CONSUMER_NAME, invoiceCustomerFromOrder } from "@/lib/invoicing/invoice-customer";

describe("invoiceCustomerFromOrder", () => {
  it("usa el documento que la clienta dio para la factura", () => {
    expect(invoiceCustomerFromOrder({ fullName: "Ana María Torres", documentId: " 1047452823 " })).toEqual({
      customerName: "Ana María Torres",
      customerDocId: "1047452823",
    });
  });

  it("sin documento la factura queda a consumidor final, nunca con el código DANE", () => {
    const order = { fullName: "Ana María Torres", documentId: "", daneCode: "11001000" };
    expect(invoiceCustomerFromOrder(order)).toEqual({ customerName: "Ana María Torres", customerDocId: null });
    expect(invoiceCustomerFromOrder({ fullName: null, documentId: null })).toEqual({
      customerName: FINAL_CONSUMER_NAME,
      customerDocId: null,
    });
  });
});
