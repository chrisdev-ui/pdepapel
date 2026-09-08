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

export interface QueueableOrder {
  status: OrderStatus;
  type: OrderType;
  createdAt?: Date | string | null;
  paidAt?: Date | string | null;
  expiresAt?: Date | string | null;
  payment?: { method: PaymentMethod } | null;
  shipping?: { status: ShippingStatus; trackingCode?: string | null } | null;
}

const QUOTE_STATUSES: OrderStatus[] = [OrderStatus.DRAFT, OrderStatus.QUOTATION, OrderStatus.VIEWED, OrderStatus.ACCEPTED];
const ISSUE_STATUSES: ShippingStatus[] = [ShippingStatus.FailedDelivery, ShippingStatus.Exception, ShippingStatus.Returned];
const IN_TRANSIT_STATUSES: ShippingStatus[] = [ShippingStatus.Shipped, ShippingStatus.PickedUp, ShippingStatus.InTransit, ShippingStatus.OutForDelivery];

const toDate = (value?: Date | string | null) => (value ? (value instanceof Date ? value : new Date(value)) : null);

export function isOlderThan(order: QueueableOrder, days: number, now = new Date()): boolean {
  const reference = toDate(order.paidAt) ?? toDate(order.createdAt);
  if (!reference) return false;
  return now.getTime() - reference.getTime() > days * 24 * 60 * 60 * 1000;
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

export function getNextStep(queue: OrderQueue): NextStep | null {
  switch (queue) {
    case "verify":
      return { label: "Verificar pago", primary: true };
    case "awaiting-payment":
      return { label: "Reenviar link de pago", primary: false };
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

export function orderMatchesView(queue: OrderQueue, view: OrderView, order?: QueueableOrder): boolean {
  switch (view) {
    case "todos":
      return true;
    case "por-atender":
      return queue === "verify" || queue === "dispatch" || queue === "issue" || (queue === "quote" && isExpiringSoon(order?.expiresAt));
    case "por-verificar":
      return queue === "verify";
    case "por-despachar":
      return queue === "dispatch";
    case "en-camino":
      return queue === "in-transit";
    case "con-novedad":
      return queue === "issue";
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

export function getPaymentBadge(order: QueueableOrder): PaymentBadge {
  const method = order.payment?.method;
  const paid = order.status === OrderStatus.PAID || order.status === OrderStatus.SENT;
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REJECTED) return { label: "Cancelado", tone: "slate" };
  if (getOrderQueue(order) === "quote") return { label: "Sin pago", tone: "slate" };
  if (paid) {
    if (method === PaymentMethod.CASH) return { label: "Efectivo", tone: "mint" };
    if (method === PaymentMethod.COD) return { label: "Contra entrega · pagado", tone: "mint" };
    return { label: "Pagado", tone: "mint" };
  }
  if (method === PaymentMethod.BankTransfer) return { label: "Por verificar", tone: "cream" };
  if (method === PaymentMethod.COD) return { label: "Contra entrega", tone: "sky" };
  if (method === PaymentMethod.CASH) return { label: "Efectivo", tone: "cream" };
  return { label: "Pago en línea pendiente", tone: "cream" };
}

export interface ShippingBadge {
  label: string;
  tone: "mint" | "cream" | "sky" | "slate" | "pink" | "lavender";
}

export function getShippingBadge(order: QueueableOrder): ShippingBadge | null {
  const inStore = order.type === OrderType.POINT_OF_SALE || order.type === OrderType.FESTIVAL;
  if (inStore) return null;
  const status = order.shipping?.status;
  if (!status || (!order.shipping?.trackingCode && status === ShippingStatus.Preparing)) return { label: "Sin guía", tone: "slate" };
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
