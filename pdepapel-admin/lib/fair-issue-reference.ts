/**
 * Una feria no es un pedido, pero su cierre también puede dejar deuda con el
 * kardex (una devolución que no pudo entrar porque el producto ya no existe).
 * Se reutiliza la tabla OrderInventoryIssue con `orderId` nulo y este prefijo
 * en `orderNumber`, para que Movimientos la muestre y el reintento sepa que el
 * movimiento correcto es «Devuelto de feria», no «Orden cancelada».
 *
 * Módulo sin dependencias a propósito: lo importan componentes de cliente.
 */
export const FAIR_ISSUE_PREFIX = "Feria: ";

export function formatFairIssueReference(fairName: string): string {
  return `${FAIR_ISSUE_PREFIX}${fairName}`;
}

export function isFairIssueReference(orderNumber: string): boolean {
  return orderNumber.startsWith(FAIR_ISSUE_PREFIX);
}

/** Misma idea para una venta de Mercado Libre: no es un pedido interno. */
export const MARKETPLACE_ISSUE_PREFIX = "Mercado Libre: ";

export function formatMarketplaceIssueReference(externalOrderId: string): string {
  return `${MARKETPLACE_ISSUE_PREFIX}${externalOrderId}`;
}

/** Deuda que no pertenece a un pedido interno (feria o marketplace). */
export function isExternalIssueReference(orderNumber: string): boolean {
  return (
    orderNumber.startsWith(FAIR_ISSUE_PREFIX) ||
    orderNumber.startsWith(MARKETPLACE_ISSUE_PREFIX)
  );
}
