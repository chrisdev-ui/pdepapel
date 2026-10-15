import { ALLOWED_TRANSITIONS } from "@/constants";
import { ShippingStatus } from "@prisma/client";

/**
 * Una sola forma de mover el estado de un envío, la use quien la use: el
 * webhook de EnvioClick, el rastreo manual, la sincronización en lote, la
 * edición por selección o la corrección de envíos manuales. Aquí viven el
 * mapa de estados de EnvioClick y las transiciones permitidas; el panel los
 * importa en el cliente, así que nada de aquí toca la base. La escritura
 * vive en `lib/shipment-status-apply.ts`.
 */

// ---------------------------------------------------------------------------
// Estados de EnvioClick → ShippingStatus
// ---------------------------------------------------------------------------

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

/** Códigos y textos que EnvioClick devuelve en rastreo, lotes y webhooks (statusStep). */
const ENVIOCLICK_STATUS: Record<string, ShippingStatus> = {
  // Códigos en inglés
  GENERATED: ShippingStatus.Shipped,
  PICKED_UP: ShippingStatus.PickedUp,
  ON_TRANSIT: ShippingStatus.InTransit,
  IN_TRANSIT: ShippingStatus.InTransit,
  WITH_DELIVERY_COURIER: ShippingStatus.OutForDelivery,
  OUT_FOR_DELIVERY: ShippingStatus.OutForDelivery,
  DELIVERED: ShippingStatus.Delivered,
  CANCELED: ShippingStatus.Cancelled,
  CANCELLED: ShippingStatus.Cancelled,
  RETURNED: ShippingStatus.Returned,
  EXCEPTION: ShippingStatus.Exception,
  FAILED_DELIVERY: ShippingStatus.FailedDelivery,
  // Textos en español (rastreo y statusStep del webhook), sin tildes
  "PENDIENTE DE RECOLECCION": ShippingStatus.Preparing,
  "EN PREPARACION": ShippingStatus.Preparing,
  DESPACHADO: ShippingStatus.Shipped,
  DESPACHADA: ShippingStatus.Shipped,
  RECOGIDO: ShippingStatus.PickedUp,
  RECOLECTADO: ShippingStatus.PickedUp,
  "ENVIO RECOLECTADO": ShippingStatus.PickedUp,
  "EN TRANSITO": ShippingStatus.InTransit,
  "EN REPARTO": ShippingStatus.OutForDelivery,
  ENTREGADO: ShippingStatus.Delivered,
  ENTREGADA: ShippingStatus.Delivered,
  "ENTREGA FALLIDA": ShippingStatus.FailedDelivery,
  "INTENTO DE ENTREGA FALLIDO": ShippingStatus.FailedDelivery,
  DEVUELTO: ShippingStatus.Returned,
  DEVUELTA: ShippingStatus.Returned,
  CANCELADO: ShippingStatus.Cancelled,
  CANCELADA: ShippingStatus.Cancelled,
  EXCEPCION: ShippingStatus.Exception,
  NOVEDAD: ShippingStatus.Exception,
};

/**
 * Traduce un estado de EnvioClick. Un valor desconocido devuelve `fallback`
 * (normalmente el estado actual): antes cada ruta inventaba uno distinto
 * («En tránsito» en la sincronización, «Incidencia» en el rastreo manual).
 */
export function mapEnvioClickStatus(raw: string | null | undefined, fallback: ShippingStatus): ShippingStatus {
  if (!raw) return fallback;
  const key = normalize(raw);
  if (ENVIOCLICK_STATUS[key]) return ENVIOCLICK_STATUS[key];
  // Textos largos («Entregado a Juan», «En tránsito hacia la ciudad destino»).
  for (const [needle, status] of Object.entries(ENVIOCLICK_STATUS)) {
    if (needle.length >= 6 && key.includes(needle)) return status;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Transiciones
// ---------------------------------------------------------------------------

export function isShipmentTransitionAllowed(from: ShippingStatus, to: ShippingStatus): boolean {
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export const CLOSED_SHIPMENT_STATUSES: ShippingStatus[] = [ShippingStatus.Delivered, ShippingStatus.Cancelled];
