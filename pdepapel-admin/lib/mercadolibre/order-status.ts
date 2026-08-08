/**
 * Mercado Libre order-status presentation helpers.
 *
 * Two distinct vocabularies exist and must not be mixed:
 *  - The stored `MarketplaceOrderStatus` enum (uppercase, e.g. "PAID"), used for
 *    sales already registered in our database.
 *  - The raw Mercado Libre order status returned by their API / our inspection
 *    endpoint (lowercase, e.g. "payment_in_process").
 *
 * Keeping the Spanish label and badge color here means the UI never renders a
 * raw status value and colors stay consistent across the integration.
 */

export type StatusBadgeVariant =
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "info";

export type StatusMeta = { label: string; variant: StatusBadgeVariant };

/** Stored `MarketplaceOrderStatus` enum → Spanish label + badge color. */
export const SALE_STATUS_META: Record<string, StatusMeta> = {
  PENDING: { label: "Pendiente de pago", variant: "warning" },
  PAID: { label: "Pagada", variant: "success" },
  SHIPPED: { label: "Enviada", variant: "info" },
  DELIVERED: { label: "Entregada", variant: "success" },
  CANCELLED: { label: "Cancelada", variant: "destructive" },
  RETURN_PENDING: { label: "Devolución en proceso", variant: "warning" },
  RETURNED: { label: "Devuelta", variant: "destructive" },
};

/** Raw Mercado Libre order status (lowercase) → Spanish label + badge color. */
export const RAW_ORDER_STATUS_META: Record<string, StatusMeta> = {
  paid: { label: "Pagada", variant: "success" },
  confirmed: { label: "Confirmada", variant: "info" },
  payment_required: { label: "Pago requerido", variant: "warning" },
  payment_in_process: { label: "Pago en proceso", variant: "warning" },
  partially_paid: { label: "Pago parcial", variant: "warning" },
  cancelled: { label: "Cancelada", variant: "destructive" },
  invalid: { label: "Inválida", variant: "destructive" },
};

/** Fallback label for an unknown status: "payment_in_process" → "Payment in process". */
export function humanizeStatus(status: string): string {
  const normalized = (status ?? "").replace(/[_-]+/g, " ").trim().toLowerCase();
  if (!normalized) return "Sin estado";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/** Meta for a stored `MarketplaceOrderStatus`; unknown values degrade gracefully. */
export function getSaleStatusMeta(status: string): StatusMeta {
  return (
    SALE_STATUS_META[status] ?? {
      label: humanizeStatus(status),
      variant: "secondary",
    }
  );
}

/** Meta for a raw Mercado Libre order status; unknown values degrade gracefully. */
export function getRawOrderStatusMeta(status: string): StatusMeta {
  return (
    RAW_ORDER_STATUS_META[(status ?? "").toLowerCase()] ?? {
      label: humanizeStatus(status),
      variant: "secondary",
    }
  );
}
