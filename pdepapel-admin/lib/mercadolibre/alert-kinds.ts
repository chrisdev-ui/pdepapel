/**
 * Qué hacer con cada alerta de Mercado Libre. Sin dependencias del servidor:
 * lo usan el menú (servidor) y la pantalla (cliente).
 */

/** Solo informan y se resuelven solas en la siguiente revisión: no cuentan en el menú. */
export const INFORMATIONAL_ALERT_KINDS = ["ml_unchecked"] as const;

export const isInformationalAlert = (kind: string) => (INFORMATIONAL_ALERT_KINDS as readonly string[]).includes(kind);

const LISTING_KINDS = [
  "listing_error",
  "listing_incomplete",
  "stock_risk",
  "margin_risk",
  "ml_price_mismatch",
  "ml_price_below_margin",
  "ml_status_changed",
  "ml_listing_review",
  "ml_twin_mismatch",
  "ml_unlinked_stock",
];
const SALES_KINDS = ["inventory_exception", "settlement_pending", "ml_order_missing", "outbox_failed", "webhook_failed"];

/** La pestaña donde se resuelve cada alerta, o null si se atiende aquí mismo. */
export function alertAction(kind: string): { tab: string; label: string } | null {
  if (LISTING_KINDS.includes(kind)) return { tab: "publicaciones", label: "Ver publicaciones" };
  if (SALES_KINDS.includes(kind)) return { tab: "ventas", label: "Ver ventas" };
  if (kind === "question") return { tab: "preguntas", label: "Responder preguntas" };
  if (kind === "claim") return { tab: "preguntas", label: "Revisar reclamos" };
  if (kind === "shipment") return { tab: "envios", label: "Ver envíos" };
  return null;
}
