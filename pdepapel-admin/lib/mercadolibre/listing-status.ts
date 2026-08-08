/** Mercado Libre listing-status presentation helpers. */

import type { StatusMeta } from "./order-status";

export const LISTING_STATUS_META: Record<string, StatusMeta> = {
  DRAFT: { label: "Borrador", variant: "secondary" },
  ACTIVE: { label: "Activa", variant: "success" },
  PAUSED: { label: "Pausada", variant: "warning" },
  CLOSED: { label: "Cerrada", variant: "secondary" },
  ERROR: { label: "Requiere revisión", variant: "destructive" },
  UNLINKED: { label: "Sin vínculo", variant: "warning" },
};

const UNKNOWN_LISTING_STATUS_META: StatusMeta = {
  label: "Estado pendiente de revisión",
  variant: "secondary",
};

export function getListingStatusMeta(status: string): StatusMeta {
  return LISTING_STATUS_META[status] ?? UNKNOWN_LISTING_STATUS_META;
}
