import { describe, expect, it } from "vitest";

import { codShippingInvoiceLines, INVOICE_COD_FEE_LINES_ENABLED } from "@/lib/invoicing/shipping-lines";

/**
 * El recaudo contra entrega en la factura, detrás de una sola función: hoy va
 * dentro de la línea de envío; pasar a una línea aparte es cambiar el modo.
 * Sin recaudo no se agrega nada (la factura de hoy no lleva el envío). La
 * tarifa de impuesto no se toca.
 */
describe("líneas de envío de la factura con recaudo contra entrega", () => {
  it("está apagado: la factura sigue exactamente como hoy hasta que responda el contador", () => {
    expect(INVOICE_COD_FEE_LINES_ENABLED).toBe(false);
  });

  it("envío cobrado: una sola línea de envío con flete + recaudo", () => {
    expect(codShippingInvoiceLines({ cost: 18000, codFee: 7000 })).toEqual([
      { description: "Envío (incluye recaudo contra entrega)", quantity: 1, unitPrice: 25000, taxRate: 0 },
    ]);
  });

  it("envío gratis + contra entrega: la línea de envío lleva solo el recaudo", () => {
    expect(codShippingInvoiceLines({ cost: 0, codFee: 7000 })).toEqual([
      { description: "Envío gratis: recaudo contra entrega", quantity: 1, unitPrice: 7000, taxRate: 0 },
    ]);
  });

  it("sin recaudo la factura no cambia", () => {
    expect(codShippingInvoiceLines({ cost: 18000, codFee: null })).toEqual([]);
    expect(codShippingInvoiceLines(null)).toEqual([]);
  });

  it("en línea aparte, cambiando solo el modo", () => {
    expect(codShippingInvoiceLines({ cost: 18000, codFee: 7000 }, "separate-line")).toEqual([
      { description: "Envío", quantity: 1, unitPrice: 18000, taxRate: 0 },
      { description: "Recaudo contra entrega", quantity: 1, unitPrice: 7000, taxRate: 0 },
    ]);
    expect(codShippingInvoiceLines({ cost: 0, codFee: 7000 }, "separate-line")).toEqual([
      { description: "Recaudo contra entrega", quantity: 1, unitPrice: 7000, taxRate: 0 },
    ]);
  });
});
