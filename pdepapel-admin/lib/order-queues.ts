import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

/**
 * Colas de trabajo de Pedidos: el estado real del pedido se traduce en lo que
 * la administradora tiene que hacer ahora. Puro y testeable.
 */

export type OrderQueue =
  | "verify" // transferencia pendiente de verificación
  | "awaiting-payment" // pago en línea que el cliente aún no completa
  | "dispatch" // pagado (o contra entrega) sin guía
  | "in-transit" // con guía, no entregado
  | "issue" // novedad de transportadora
  | "delivered"
  | "quote" // cotización viva
  | "completed" // ventas presenciales o de feria ya cobradas
  | "closed"; // cancelado o rechazado

export type OrderView =
  | "por-atender"
  | "por-verificar"
  | "por-despachar"
  | "en-camino"
  | "con-novedad"
  | "cotizaciones"
  | "todos";

export const ORDER_VIEWS: { id: OrderView; label: string }[] = [
  { id: "por-atender", label: "Por atender" },
  { id: "por-verificar", label: "Por verificar" },
  { id: "por-despachar", label: "Por despachar" },
  { id: "en-camino", label: "En camino" },
  { id: "con-novedad", label: "Con novedad" },
  { id: "cotizaciones", label: "Cotizaciones" },
  { id: "todos", label: "Todos" },
];

export const DEFAULT_ORDER_VIEW: OrderView = "por-atender";

export function isOrderView(value: string | null | undefined): value is OrderView {
  return ORDER_VIEWS.some((view) => view.id === value);
}

/** Un pedido pagado sin guía más viejo que esto ya se entregó por fuera del sistema: no es trabajo pendiente. */
export const DISPATCH_WINDOW_DAYS = 30;

/**
 * Pago en línea sin completar: Bold y Wompi vencen la sesión de pago en
 * minutos y el enlace en horas, así que un pedido que sigue pendiente dos
 * horas después de creado ya no se va a pagar solo. Desde ese momento es
 * trabajo: reenviar el enlace o cambiar el método. Pasados 14 días (la misma
 * ventana que las transferencias) es un carrito abandonado, no un pendiente.
 */
export const AWAITING_PAYMENT_STALE_HOURS = 2;
export const AWAITING_PAYMENT_WINDOW_DAYS = 14;

export interface QueueableOrder {
  status: OrderStatus;
  type: OrderType;
  createdAt?: Date | string | null;
  paidAt?: Date | string | null;
  expiresAt?: Date | string | null;
  payment?: { method: PaymentMethod } | null;
  shipping?: { status: ShippingStatus; trackingCode?: string | null; updatedAt?: Date | string | null } | null;
  /** Líneas de inventario que fallaron al mover y siguen sin resolver. */
  openInventoryIssues?: number;
}

/** Deuda con el kardex: el pedido cambió de estado pero alguna línea no se movió. */
export function hasOpenInventoryIssues(order?: QueueableOrder): boolean {
  return Boolean(order && (order.openInventoryIssues ?? 0) > 0);
}

export function getInventoryIssueBadge(order?: QueueableOrder): { label: string; tone: "pink" } | null {
  return hasOpenInventoryIssues(order) ? { label: "Inventario sin cuadrar", tone: "pink" } : null;
}

/** Días sin novedad en tránsito a partir de los cuales el pedido pide atención (misma ventana que Envíos). */
export const STALE_IN_TRANSIT_DAYS = 5;

const QUOTE_STATUSES: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.QUOTATION, OrderStatus.VIEWED, OrderStatus.ACCEPTED];
const ISSUE_STATUSES: ShippingStatus[] = [ShippingStatus.FailedDelivery, ShippingStatus.Exception, ShippingStatus.Returned];
const IN_TRANSIT_STATUSES: ShippingStatus[] = [ShippingStatus.Shipped, ShippingStatus.PickedUp, ShippingStatus.InTransit, ShippingStatus.OutForDelivery];

const toDate = (value?: Date | string | null) => (value ? (value instanceof Date ? value : new Date(value)) : null);

export function isOlderThan(order: QueueableOrder, days: number, now = new Date()): boolean {
  const reference = toDate(order.paidAt) ?? toDate(order.createdAt);
  if (!reference) return false;
  return now.getTime() - reference.getTime() > days * 24 * 60 * 60 * 1000;
}

/**
 * Pago en línea que lleva más de dos horas sin completarse y menos de 14 días:
 * hay que reaccionar (reenviar el enlace, cambiar el método o cancelar).
 */
export function isAwaitingPaymentStale(order: QueueableOrder, now = new Date()): boolean {
  const created = toDate(order.createdAt);
  if (!created) return false;
  const age = now.getTime() - created.getTime();
  return age > AWAITING_PAYMENT_STALE_HOURS * 60 * 60 * 1000 && age <= AWAITING_PAYMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

export function getOrderQueue(order: QueueableOrder, now = new Date()): OrderQueue {
  const { status, type } = order;
  if (status === OrderStatus.CANCELLED || status === OrderStatus.REJECTED) return "closed";
  if (type === OrderType.QUOTATION && QUOTE_STATUSES.includes(status)) return "quote";
  if (status === OrderStatus.DRAFT) return "quote";

  const shippingStatus = order.shipping?.status;
  const hasGuide = Boolean(order.shipping?.trackingCode);
  const inStore = type === OrderType.POINT_OF_SALE || type === OrderType.FESTIVAL;

  if (shippingStatus && ISSUE_STATUSES.includes(shippingStatus)) return "issue";
  if (shippingStatus === ShippingStatus.Delivered) return "delivered";

  if (status === OrderStatus.PENDING || status === OrderStatus.CREATED) {
    const method = order.payment?.method;
    if (method === PaymentMethod.BankTransfer) return "verify";
    if (method === PaymentMethod.COD) return hasGuide ? "in-transit" : "dispatch";
    if (method === PaymentMethod.CASH) return inStore ? "completed" : "verify";
    return "awaiting-payment";
  }

  if (status === OrderStatus.PAID || status === OrderStatus.SENT) {
    if (inStore) return "completed";
    if (hasGuide || status === OrderStatus.SENT || (shippingStatus && IN_TRANSIT_STATUSES.includes(shippingStatus))) return "in-transit";
    return isOlderThan(order, DISPATCH_WINDOW_DAYS, now) ? "completed" : "dispatch";
  }

  return "closed";
}

export interface NextStep {
  label: string;
  /** Acción principal (botón oscuro) o secundaria. */
  primary: boolean;
}

export function getNextStep(queue: OrderQueue, order?: QueueableOrder, now = new Date()): NextStep | null {
  switch (queue) {
    case "verify":
      return { label: "Verificar pago", primary: true };
    case "awaiting-payment":
      return { label: "Reenviar enlace de pago", primary: Boolean(order && isAwaitingPaymentStale(order, now)) };
    case "dispatch":
      return { label: "Crear guía", primary: false };
    case "in-transit":
      return { label: "Ver seguimiento", primary: false };
    case "issue":
      return { label: "Revisar novedad", primary: true };
    case "quote":
      return { label: "Ver cotización", primary: false };
    case "delivered":
    case "completed":
      return { label: "Ver recibo", primary: false };
    default:
      return null;
  }
}

export function orderMatchesView(queue: OrderQueue, view: OrderView, order?: QueueableOrder, now = new Date()): boolean {
  switch (view) {
    case "todos":
      return true;
    case "por-atender":
      return (
        hasOpenInventoryIssues(order) ||
        (queue === "in-transit" && Boolean(order && isShippingStale(order, now))) ||
        queue === "verify" ||
        queue === "dispatch" ||
        queue === "issue" ||
        (queue === "quote" && isExpiringSoon(order?.expiresAt, now)) ||
        (queue === "awaiting-payment" && Boolean(order && isAwaitingPaymentStale(order, now)))
      );
    case "por-verificar":
      return queue === "verify";
    case "por-despachar":
      return queue === "dispatch";
    case "en-camino":
      return queue === "in-transit";
    case "con-novedad":
      return queue === "issue" || (queue === "in-transit" && Boolean(order && isShippingStale(order, now)));
    case "cotizaciones":
      return queue === "quote";
  }
}

export function isExpiringSoon(expiresAt?: Date | string | null, now = new Date(), days = 2): boolean {
  if (!expiresAt) return false;
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const diff = date.getTime() - now.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

export type SalesChannel = "tienda" | "presencial" | "feria" | "cotizacion" | "personalizado";

export function getOrderChannel(type: OrderType): { id: SalesChannel; label: string } {
  switch (type) {
    case OrderType.POINT_OF_SALE:
      return { id: "presencial", label: "Presencial" };
    case OrderType.FESTIVAL:
      return { id: "feria", label: "Feria" };
    case OrderType.QUOTATION:
      return { id: "cotizacion", label: "Cotización" };
    case OrderType.CUSTOM:
      return { id: "personalizado", label: "Personalizado" };
    default:
      return { id: "tienda", label: "Tienda" };
  }
}

export interface PaymentBadge {
  label: string;
  tone: "mint" | "cream" | "sky" | "slate" | "pink";
}

export function getPaymentBadge(order: QueueableOrder, now = new Date()): PaymentBadge {
  const method = order.payment?.method;
  const paid = order.status === OrderStatus.PAID || order.status === OrderStatus.SENT;
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) return { label: "Cancelado", tone: "slate" };
  if (getOrderQueue(order, now) === "quote") return { label: "Sin pago", tone: "slate" };
  if (paid) {
    if (method === PaymentMethod.CASH) return { label: "Efectivo", tone: "mint" };
    if (method === PaymentMethod.COD) return { label: "Contra entrega · pagado", tone: "mint" };
    return { label: "Pagado", tone: "mint" };
  }
  if (method === PaymentMethod.BankTransfer) return { label: "Por verificar", tone: "cream" };
  if (method === PaymentMethod.COD) return { label: "Contra entrega", tone: "sky" };
  if (method === PaymentMethod.CASH) return { label: "Efectivo", tone: "cream" };
  return isAwaitingPaymentStale(order, now)
    ? { label: "Pago en línea sin completar", tone: "pink" }
    : { label: "Pago en línea pendiente", tone: "cream" };
}

export interface ShippingBadge {
  label: string;
  tone: "mint" | "cream" | "sky" | "slate" | "pink" | "lavender";
}

/** Guía en camino sin ningún cambio en más de STALE_IN_TRANSIT_DAYS: nadie sabe dónde está el paquete. */
export function isShippingStale(order: QueueableOrder, now = new Date()): boolean {
  const shipping = order.shipping;
  if (!shipping || !IN_TRANSIT_STATUSES.includes(shipping.status)) return false;
  const updated = toDate(shipping.updatedAt);
  if (!updated) return false;
  return now.getTime() - updated.getTime() > STALE_IN_TRANSIT_DAYS * 24 * 60 * 60 * 1000;
}

export function getShippingBadge(order: QueueableOrder, now = new Date()): ShippingBadge | null {
  const inStore = order.type === OrderType.POINT_OF_SALE || order.type === OrderType.FESTIVAL;
  if (inStore) return null;
  const status = order.shipping?.status;
  if (!status || (!order.shipping?.trackingCode && status === ShippingStatus.Preparing)) return { label: "Sin guía", tone: "slate" };
  if (isShippingStale(order, now)) {
    const days = Math.floor((now.getTime() - toDate(order.shipping?.updatedAt)!.getTime()) / (24 * 60 * 60 * 1000));
    return { label: `Sin novedades hace ${days} días`, tone: "pink" };
  }
  switch (status) {
    case ShippingStatus.Preparing:
      return { label: "Preparando", tone: "lavender" };
    case ShippingStatus.Shipped:
    case ShippingStatus.PickedUp:
    case ShippingStatus.InTransit:
      return { label: "En camino", tone: "sky" };
    case ShippingStatus.OutForDelivery:
      return { label: "En reparto", tone: "sky" };
    case ShippingStatus.Delivered:
      return { label: "Entregado", tone: "mint" };
    case ShippingStatus.FailedDelivery:
      return { label: "Entrega fallida", tone: "pink" };
    case ShippingStatus.Returned:
      return { label: "Devuelto", tone: "pink" };
    case ShippingStatus.Exception:
      return { label: "Incidencia", tone: "pink" };
    case ShippingStatus.Cancelled:
      return { label: "Envío cancelado", tone: "slate" };
    default:
      return null;
  }
}
