/**
 * El historial de una reserva en palabras: quién (el panel o el sistema),
 * cuándo y qué. Nunca datos de la clienta ni ids: la cuenta del panel la
 * comparten dos personas, así que se dice «Panel», no un nombre.
 */
export type ReservationEventView = {
  id: string;
  kind: string;
  productId: string | null;
  quantity: number | null;
  previousQuantity: number | null;
  actor: string | null;
  detail: unknown;
  createdAt: string;
};

const FIELD_LABELS: Record<string, string> = { customerName: "nombre", customerPhone: "celular", note: "nota" };

export const actorLabel = (actor: string | null) => (!actor || actor === "SYSTEM" ? "Sistema" : "Panel");

const units = (value: number) => `${value} ${value === 1 ? "unidad" : "unidades"}`;

export function describeReservationEvent(event: ReservationEventView, productNames: Record<string, string>): string {
  const detail = (event.detail && typeof event.detail === "object" ? event.detail : {}) as Record<string, unknown>;
  const name = (event.productId && productNames[event.productId]) || "un producto";
  const viaOrder = detail.via === "pedido" ? " (desde el pedido)" : "";
  const quantity = event.quantity ?? 0;
  const before = event.previousQuantity ?? 0;
  switch (event.kind) {
    case "created": {
      const items = Number(detail.items ?? 0);
      const days = Number(detail.days ?? 0);
      return `Creó la reserva${items ? ` con ${items === 1 ? "1 producto" : `${items} productos`}` : ""}${days ? ` por ${days === 1 ? "1 día" : `${days} días`}` : ""}`;
    }
    case "item_added":
      return before > 0 ? `Agregó ${name}: ${before} → ${units(quantity)}${viaOrder}` : `Agregó ${units(quantity)} de ${name}${viaOrder}`;
    case "item_quantity":
      return `Cambió ${name}: ${before} → ${units(quantity)}${viaOrder}`;
    case "item_removed":
      return `Quitó ${name} (${units(before)})${viaOrder}`;
    case "customer_edited": {
      const fields = Array.isArray(detail.fields) ? detail.fields.map((field) => FIELD_LABELS[String(field)] ?? String(field)) : [];
      return `Cambió los datos de la clienta${fields.length ? ` (${fields.join(", ")})` : ""}`;
    }
    case "extended": {
      const days = Number(detail.days ?? 0);
      return `Extendió ${days === 1 ? "1 día" : `${days} días`}`;
    }
    case "converted":
      return "La convirtió en pedido";
    case "released":
      return detail.reason === "sin_productos" ? "Se liberó al quitar el último producto" : detail.reason === "pedido_sin_productos" ? "Se liberó: el pedido quedó sin productos" : "Liberó la reserva";
    case "expired":
      return "Venció: las unidades volvieron a la venta";
    case "consumed":
      return "Se vendió: el pedido se pagó";
    case "unbacked":
      return `${name} quedó sin respaldo (una venta pagada se llevó las unidades)`;
    default:
      return "Cambio en la reserva";
  }
}
