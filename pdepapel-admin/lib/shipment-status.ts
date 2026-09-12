import { ALLOWED_TRANSITIONS } from "@/constants";
import { reconcileShipmentStatus } from "@/lib/order-transitions";
import type { OrderStatus, OrderType, PaymentMethod, Prisma, PrismaClient } from "@prisma/client";
import { ShippingStatus } from "@prisma/client";

/**
 * Una sola forma de mover el estado de un envío, la use quien la use: el
 * webhook de EnvioClick, el rastreo manual, la sincronización en lote, la
 * edición por selección o la corrección de envíos manuales. Aquí viven el
 * mapa de estados de EnvioClick, las transiciones permitidas y la regla que
 * mantiene coherente el pedido con su envío.
 */

type Db = PrismaClient | Prisma.TransactionClient;

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

// ---------------------------------------------------------------------------
// Aplicar un estado y mantener coherente el pedido
// ---------------------------------------------------------------------------

export interface ApplyShipmentStatusInput {
  shippingId: string;
  storeId: string;
  status: ShippingStatus;
  /** Otros campos del envío que llegan con la novedad (guía, fechas). */
  extra?: Pick<Prisma.ShippingUncheckedUpdateInput, "trackingCode" | "pickupDate" | "estimatedDeliveryDate" | "actualDeliveryDate">;
  /** Con `true`, se escribe aunque el estado no cambie (una novedad real de la transportadora). */
  touch?: boolean;
}

export interface ApplyShipmentStatusResult {
  shipmentChanged: boolean;
  previousStatus: ShippingStatus;
  status: ShippingStatus;
  orderStatus: OrderStatus;
  orderChanged: boolean;
}

/**
 * Escribe el estado del envío solo cuando cambia (o cuando `touch` dice que
 * hubo novedad), así `updatedAt` sigue midiendo el silencio real de la
 * transportadora para la señal «sin novedades». Después mueve el pedido a
 * «Enviado» si el envío arrancó y la transición está permitida
 * (`reconcileShipmentStatus`): un pedido cancelado no vuelve a «Enviado» por
 * un evento tardío.
 */
export async function applyShipmentStatus(db: Db, input: ApplyShipmentStatusInput): Promise<ApplyShipmentStatusResult | null> {
  const shipping = await db.shipping.findFirst({
    where: { id: input.shippingId, storeId: input.storeId },
    select: {
      id: true,
      status: true,
      orderId: true,
      order: { select: { id: true, status: true, type: true, payment: { select: { method: true } } } },
    },
  });
  if (!shipping) return null;

  const previousStatus = shipping.status;
  const extra = input.extra ?? {};
  const hasExtra = Object.values(extra).some((value) => value !== undefined);
  const shipmentChanged = input.status !== previousStatus;

  if (shipmentChanged || hasExtra || input.touch) {
    await db.shipping.update({
      where: { id: shipping.id },
      data: { ...(shipmentChanged ? { status: input.status } : {}), ...extra },
    });
  }

  let orderStatus = shipping.order.status;
  let orderChanged = false;
  const reconciled = reconcileShipmentStatus({
    from: shipping.order.status,
    shippingStatus: previousStatus,
    requestedShippingStatus: input.status,
    context: { type: shipping.order.type as OrderType, paymentMethod: (shipping.order.payment?.method as PaymentMethod | undefined) ?? null },
  });
  if (reconciled.status && reconciled.status !== shipping.order.status) {
    await db.order.updateMany({ where: { id: shipping.orderId, storeId: input.storeId }, data: { status: reconciled.status } });
    orderStatus = reconciled.status;
    orderChanged = true;
  }

  return { shipmentChanged, previousStatus, status: input.status, orderStatus, orderChanged };
}
