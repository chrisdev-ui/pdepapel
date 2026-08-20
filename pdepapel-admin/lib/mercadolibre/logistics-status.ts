export const SHIPMENT_STATUS_META: Record<
  string,
  {
    label: string;
    variant: "secondary" | "success" | "warning" | "destructive" | "info";
  }
> = {
  ready_to_ship: { label: "Listo para despachar", variant: "warning" },
  shipped: { label: "Enviado", variant: "info" },
  in_transit: { label: "En tránsito", variant: "info" },
  out_for_delivery: { label: "En ruta de entrega", variant: "warning" },
  delivered: { label: "Entregado", variant: "success" },
  not_delivered: { label: "No entregado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  returned: { label: "Devuelto", variant: "destructive" },
};

const DISPATCHABLE_SHIPMENT_STATUSES = new Set([
  "pending",
  "handling",
  "ready_to_ship",
]);

export function normalizeMercadoLibreShipmentStatus(status: string) {
  const normalizedStatus = status.toLowerCase();
  return normalizedStatus === "canceled" ? "cancelled" : normalizedStatus;
}

export function isMercadoLibreShipmentAwaitingDispatch(status: string) {
  return DISPATCHABLE_SHIPMENT_STATUSES.has(
    normalizeMercadoLibreShipmentStatus(status),
  );
}

/**
 * A shipment in one of these states will not change again, so refreshing it
 * would only spend Mercado Libre API calls.
 */
const SETTLED_SHIPMENT_STATUSES = new Set([
  "delivered",
  "not_delivered",
  "cancelled",
  "returned",
]);

export function isMercadoLibreShipmentSettled(status: string) {
  return SETTLED_SHIPMENT_STATUSES.has(
    normalizeMercadoLibreShipmentStatus(status),
  );
}

export const SETTLED_MERCADOLIBRE_SHIPMENT_STATUSES = Array.from(
  SETTLED_SHIPMENT_STATUSES,
);

export function getEffectiveMercadoLibreShipmentStatus(
  shipmentStatus: string,
  marketplaceOrderStatus: string | null | undefined,
) {
  const normalizedShipmentStatus = normalizeMercadoLibreShipmentStatus(
    shipmentStatus,
  );
  if (
    marketplaceOrderStatus?.toLowerCase() === "cancelled" &&
    isMercadoLibreShipmentAwaitingDispatch(normalizedShipmentStatus)
  ) {
    return "cancelled";
  }

  return normalizedShipmentStatus;
}

export function getShipmentStatusMeta(status: string) {
  const normalizedStatus = normalizeMercadoLibreShipmentStatus(status);
  return (
    SHIPMENT_STATUS_META[normalizedStatus] ?? {
      label: "Estado pendiente de revisión",
      variant: "secondary" as const,
    }
  );
}

export function getClaimStatusMeta(status: string) {
  const value = status.toLowerCase();
  if (["closed", "resolved"].includes(value)) {
    return { label: "Cerrado", variant: "success" as const };
  }
  if (["opened", "pending", "dispute"].includes(value)) {
    return { label: "Requiere atención", variant: "warning" as const };
  }
  return {
    label: "Estado pendiente de revisión",
    variant: "secondary" as const,
  };
}
