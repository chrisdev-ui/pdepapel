import type { MarketplaceOrderStatus } from "@prisma/client";

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
  PARTIALLY_REFUNDED: { label: "Reembolso parcial", variant: "warning" },
  REFUNDED: { label: "Reembolsada", variant: "destructive" },
};

/**
 * Qué estados cuentan como ingreso. Decidido a propósito: un reembolso parcial
 * sigue siendo una venta (su neto ya descuenta lo devuelto); un reembolso
 * total o un contracargo no es ingreso aunque Mercado Libre haya cobrado
 * comisión. Toda consulta de dinero debe usar esta lista, nunca `PAID` suelto.
 */
export const REVENUE_MARKETPLACE_ORDER_STATUSES = [
  "PAID",
  "PARTIALLY_REFUNDED",
] as const satisfies readonly MarketplaceOrderStatus[];

/** Estados en los que la mercancía salió y no ha vuelto: piden retorno físico. */
export const RETURN_MARKETPLACE_ORDER_STATUSES = [
  "CANCELLED",
  "REFUNDED",
] as const satisfies readonly MarketplaceOrderStatus[];

export function isRevenueMarketplaceOrderStatus(status: string): boolean {
  return (REVENUE_MARKETPLACE_ORDER_STATUSES as readonly string[]).includes(status);
}

export function isReturnMarketplaceOrderStatus(status: string): boolean {
  return (RETURN_MARKETPLACE_ORDER_STATUSES as readonly string[]).includes(status);
}

/** Raw Mercado Libre order status (lowercase) → Spanish label + badge color. */
export const RAW_ORDER_STATUS_META: Record<string, StatusMeta> = {
  paid: { label: "Pagada", variant: "success" },
  confirmed: { label: "Confirmada", variant: "info" },
  payment_required: { label: "Pago requerido", variant: "warning" },
  payment_in_process: { label: "Pago en proceso", variant: "warning" },
  payment_review: { label: "Pago en revisión", variant: "warning" },
  partially_paid: { label: "Pago parcial", variant: "warning" },
  cancelled: { label: "Cancelada", variant: "destructive" },
  invalid: { label: "Inválida", variant: "destructive" },
  refunded: { label: "Reembolsada", variant: "destructive" },
  partially_refunded: { label: "Reembolso parcial", variant: "warning" },
  charged_back: { label: "Contracargo", variant: "destructive" },
  expired: { label: "Vencida", variant: "destructive" },
};

const UNKNOWN_STATUS_META: StatusMeta = {
  label: "Estado pendiente de revisión",
  variant: "secondary",
};

/** Meta for a stored `MarketplaceOrderStatus`; unknown values degrade gracefully. */
export function getSaleStatusMeta(status: string): StatusMeta {
  return SALE_STATUS_META[status] ?? UNKNOWN_STATUS_META;
}

/** Meta for a raw Mercado Libre order status; unknown values degrade gracefully. */
export function getRawOrderStatusMeta(status: string): StatusMeta {
  return (
    RAW_ORDER_STATUS_META[(status ?? "").toLowerCase()] ?? UNKNOWN_STATUS_META
  );
}

export type TintTone = "pink" | "lavender" | "mint" | "cream" | "sky" | "slate";

/**
 * `MarketplaceInventoryStatus` → etiqueta y tono para la lista de ventas. Es
 * el estado que decide si hay algo que hacer: excepción (re-sincronizar),
 * retorno pendiente (confirmar el retorno físico) o nada.
 */
export const INVENTORY_STATUS_META: Record<
  string,
  { label: string; tone: TintTone; action: "resync" | "restock" | null }
> = {
  NOT_APPLIED: { label: "Inventario sin aplicar", tone: "slate", action: "resync" },
  DECREMENTED: { label: "Inventario descontado", tone: "mint", action: null },
  RESTOCK_PENDING: { label: "Retorno físico pendiente", tone: "cream", action: "restock" },
  RESTOCKED: { label: "Inventario devuelto", tone: "sky", action: null },
  EXCEPTION: { label: "Inventario con excepción", tone: "pink", action: "resync" },
};

export function getInventoryStatusMeta(status: string) {
  return (
    INVENTORY_STATUS_META[status] ?? {
      label: "Inventario pendiente de revisión",
      tone: "slate" as TintTone,
      action: null,
    }
  );
}
