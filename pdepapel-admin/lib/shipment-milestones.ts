import { ShippingStatus } from "@prisma/client";

/**
 * Los avisos de envío que recibe la clienta y la regla de avance de un envío.
 * Puro: lo importan el webhook, las rutas de guías, el notificador y las pruebas.
 *
 * `ALLOWED_TRANSITIONS` (constants) describe lo que el panel deja escoger a mano
 * y no sirve para lo que llega de la transportadora: un envío pasa de «En
 * tránsito» a «Entregado» sin «En reparto» (7 de 9 envíos reales, 2026-09/10).
 * Aquí manda el orden: un evento nunca devuelve el envío a un paso anterior
 * («Pendiente de recolección» después de crear la guía ya no lo regresa a
 * «Preparando» ni manda un correo).
 */

export const SHIPMENT_MILESTONES = ["guia_creada", "en_camino", "en_reparto", "entregado", "novedad"] as const;
export type ShipmentMilestone = (typeof SHIPMENT_MILESTONES)[number];

export function isShipmentMilestone(value: string): value is ShipmentMilestone {
  return (SHIPMENT_MILESTONES as readonly string[]).includes(value);
}

const PROGRESS_RANK: Partial<Record<ShippingStatus, number>> = {
  [ShippingStatus.Preparing]: 0,
  [ShippingStatus.Shipped]: 1,
  [ShippingStatus.PickedUp]: 2,
  [ShippingStatus.InTransit]: 3,
  [ShippingStatus.OutForDelivery]: 4,
  [ShippingStatus.Delivered]: 5,
};

const ISSUE: ShippingStatus[] = [ShippingStatus.Exception, ShippingStatus.FailedDelivery];
const TERMINAL: ShippingStatus[] = [ShippingStatus.Delivered, ShippingStatus.Cancelled, ShippingStatus.Returned];

/**
 * El estado que queda después de un evento de la transportadora.
 * - Entregado, cancelado y devuelto no se mueven más.
 * - Una novedad (excepción, entrega fallida) entra en cualquier momento antes.
 * - Después de una novedad el envío puede seguir desde «Recogido» en adelante.
 * - En lo demás, solo hacia adelante.
 */
export function nextShipmentStatus(current: ShippingStatus, incoming: ShippingStatus): ShippingStatus {
  if (current === incoming) return current;
  if (TERMINAL.includes(current)) return current;
  if (ISSUE.includes(incoming) || incoming === ShippingStatus.Returned || incoming === ShippingStatus.Cancelled) return incoming;
  const to = PROGRESS_RANK[incoming];
  if (to === undefined) return current;
  if (ISSUE.includes(current)) return to >= (PROGRESS_RANK[ShippingStatus.PickedUp] ?? 2) ? incoming : current;
  const from = PROGRESS_RANK[current] ?? -1;
  return to > from ? incoming : current;
}

/** El aviso que corresponde a un estado; `null` si ese estado no se avisa (cancelado). */
export function milestoneForStatus(status: ShippingStatus): ShipmentMilestone | null {
  switch (status) {
    case ShippingStatus.Preparing:
    case ShippingStatus.Shipped:
      return "guia_creada";
    case ShippingStatus.PickedUp:
    case ShippingStatus.InTransit:
      return "en_camino";
    case ShippingStatus.OutForDelivery:
      return "en_reparto";
    case ShippingStatus.Delivered:
      return "entregado";
    case ShippingStatus.Exception:
    case ShippingStatus.FailedDelivery:
    case ShippingStatus.Returned:
      return "novedad";
    default:
      return null;
  }
}

const MILESTONE_RANK: Record<ShipmentMilestone, number> = {
  guia_creada: 1,
  en_camino: 2,
  en_reparto: 3,
  entregado: 4,
  novedad: 0,
};

/**
 * ¿Sigue valiendo un aviso que no salió? Para el barrido de reintentos: un
 * «guía creada» perdido no se manda si el envío ya va en camino; una novedad
 * solo mientras el envío siga con novedad.
 */
export function milestoneStillCurrent(milestone: ShipmentMilestone, status: ShippingStatus | null | undefined): boolean {
  if (!status) return false;
  const current = milestoneForStatus(status);
  if (!current) return false;
  if (milestone === "novedad") return current === "novedad";
  if (current === "novedad") return false;
  return MILESTONE_RANK[current] === MILESTONE_RANK[milestone];
}

/** Paula recibe copia solo de lo que le pide actuar: entregas y novedades. */
export function milestoneNotifiesAdmin(milestone: ShipmentMilestone): boolean {
  return milestone === "entregado" || milestone === "novedad";
}
