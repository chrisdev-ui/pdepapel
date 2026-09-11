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
