/**
 * A quién va la factura de un pedido. El documento es el que la clienta dio
 * al pedir factura a su nombre; sin él, la factura sale a consumidor final
 * (`customerDocId` vacío: el PDF muestra «Consumidor Final»). Antes aquí se
 * guardaba el código DANE de la ciudad como si fuera la cédula.
 */
export const FINAL_CONSUMER_NAME = "Consumidor Final";

export function invoiceCustomerFromOrder(order: {
  fullName?: string | null;
  documentId?: string | null;
  email?: string | null;
}) {
  const documentId = order.documentId?.trim();
  return {
    customerName: order.fullName?.trim() || FINAL_CONSUMER_NAME,
    customerDocId: documentId ? documentId : null,
  };
}
