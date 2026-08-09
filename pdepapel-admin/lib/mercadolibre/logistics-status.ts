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

export function getShipmentStatusMeta(status: string) {
  return (
    SHIPMENT_STATUS_META[status.toLowerCase()] ?? {
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
