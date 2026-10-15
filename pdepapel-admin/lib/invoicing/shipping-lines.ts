import type { InvoiceRequest } from "./types";

/**
 * APAGADO hasta que responda el contador. Hoy la factura no lleva el envío
 * de ningún pedido; facturar flete + recaudo solo en los contra entrega
 * cambiaría la facturación de forma dispareja. Con esto en false la factura
 * queda exactamente como antes.
 */
export const INVOICE_COD_FEE_LINES_ENABLED = false;

/**
 * Cómo iría el recaudo contra entrega en la factura (decisión 2026-10-15:
 * dentro de la línea de envío). Cambiar a "separate-line" es esta sola línea.
 * Pendiente con el contador: si el recaudo tiene el mismo tratamiento
 * tributario que el flete. Aquí no se toca ninguna tarifa de impuesto.
 */
export type CodFeeInvoiceMode = "inside-shipping" | "separate-line";
export const COD_FEE_INVOICE_MODE: CodFeeInvoiceMode = "inside-shipping";

type InvoiceLine = InvoiceRequest["items"][number];

/**
 * Las líneas de envío de un pedido con recaudo contra entrega. Sin recaudo no
 * devuelve nada: hoy la factura no lleva el envío y eso no cambia aquí.
 */
export function codShippingInvoiceLines(
  shipping: { cost?: number | null; codFee?: number | null } | null | undefined,
  mode: CodFeeInvoiceMode = COD_FEE_INVOICE_MODE,
): InvoiceLine[] {
  const fee = Number(shipping?.codFee ?? 0);
  if (!(fee > 0)) return [];
  const freight = Math.max(0, Number(shipping?.cost ?? 0));

  if (mode === "separate-line") {
    return [
      ...(freight > 0 ? [{ description: "Envío", quantity: 1, unitPrice: freight, taxRate: 0 }] : []),
      { description: "Recaudo contra entrega", quantity: 1, unitPrice: fee, taxRate: 0 },
    ];
  }
  return [
    {
      description: freight > 0 ? "Envío (incluye recaudo contra entrega)" : "Envío gratis: recaudo contra entrega",
      quantity: 1,
      unitPrice: freight + fee,
      taxRate: 0,
    },
  ];
}
