import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

import { DISPATCH_WINDOW_DAYS, getColombiaDayBounds } from "@/lib/dashboard-today";

/**
 * Vistas de trabajo de Envíos (rediseño 2026-09).
 *
 * Cada vista responde a una pregunta del día: qué falta despachar, qué salió
 * hoy, qué va en camino, qué tiene novedad y qué ya llegó. Son filtros puros
 * sobre la lista completa; no cambian estados.
 */

export const SHIPMENT_VIEWS = [
  { id: "por-despachar", label: "Por despachar" },
  { id: "despachados-hoy", label: "Despachados hoy" },
  { id: "en-camino", label: "En camino" },
  { id: "con-novedad", label: "Con novedad" },
  { id: "entregados", label: "Entregados" },
  { id: "todos", label: "Todos" },
] as const;

export type ShipmentView = (typeof SHIPMENT_VIEWS)[number]["id"];
export const DEFAULT_SHIPMENT_VIEW: ShipmentView = "por-despachar";

export function isShipmentView(value: string | null | undefined): value is ShipmentView {
  return SHIPMENT_VIEWS.some((view) => view.id === value);
}

export interface ViewableShipment {
  status: ShippingStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Primer evento de rastreo, cuando existe: la salida real del paquete. */
  firstEventAt?: Date | null;
  order?: {
    status: OrderStatus;
    type: OrderType;
    paymentMethod?: PaymentMethod | null;
  } | null;
}

const IN_TRANSIT: ShippingStatus[] = [
  ShippingStatus.Shipped,
  ShippingStatus.PickedUp,
  ShippingStatus.InTransit,
  ShippingStatus.OutForDelivery,
];

const WITH_ISSUE: ShippingStatus[] = [
  ShippingStatus.FailedDelivery,
  ShippingStatus.Returned,
  ShippingStatus.Exception,
];

const CLOSED_ORDER: OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.REJECTED,
  OrderStatus.DRAFT,
  OrderStatus.QUOTATION,
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Días sin novedad en tránsito a partir de los cuales el envío pide atención. */
export const STALE_IN_TRANSIT_DAYS = 5;

/** Guía en camino cuyo último cambio (evento o estado) es más viejo que la ventana: nadie sabe dónde está el paquete. */
export function isStaleInTransit(shipment: Pick<ViewableShipment, "status" | "updatedAt">, now = new Date()): boolean {
  return IN_TRANSIT.includes(shipment.status) && now.getTime() - shipment.updatedAt.getTime() > STALE_IN_TRANSIT_DAYS * DAY_MS;
}

export function daysWithoutNews(shipment: Pick<ViewableShipment, "updatedAt">, now = new Date()): number {
  return Math.floor((now.getTime() - shipment.updatedAt.getTime()) / DAY_MS);
}

/** Insignia rosa «Sin novedades hace N días» para un envío en tránsito estancado; null si no aplica. */
export function getStaleInTransitBadge(shipment: Pick<ViewableShipment, "status" | "updatedAt">, now = new Date()): { label: string; tone: "pink" } | null {
  if (!isStaleInTransit(shipment, now)) return null;
  return { label: `Sin novedades hace ${daysWithoutNews(shipment, now)} días`, tone: "pink" };
}

/** Envíos en preparación más antiguos que la ventana de despacho: datos históricos, no trabajo de hoy. */
export function isStaleDispatch(shipment: ViewableShipment, now = new Date()): boolean {
  return (
    shipment.status === ShippingStatus.Preparing &&
    now.getTime() - shipment.createdAt.getTime() > DISPATCH_WINDOW_DAYS * DAY_MS
  );
}

/**
 * Un envío se puede despachar cuando el pedido ya está pagado o es contra
 * entrega y no es más antiguo que la ventana de despacho (igual que la cola
 * «Por despachar» de Pedidos); los más viejos siguen en «Todos».
 */
export function isReadyToDispatch(shipment: ViewableShipment, now = new Date()): boolean {
  if (shipment.status !== ShippingStatus.Preparing) return false;
  if (isStaleDispatch(shipment, now)) return false;
  const order = shipment.order;
  if (!order) return false;
  if (order.type === OrderType.POINT_OF_SALE || order.type === OrderType.FESTIVAL) return false;
  if (CLOSED_ORDER.includes(order.status)) return false;
  if (order.status === OrderStatus.PAID) return true;
  return order.paymentMethod === PaymentMethod.COD;
}

const JUST_DISPATCHED: ShippingStatus[] = [ShippingStatus.Shipped, ShippingStatus.PickedUp];

/**
 * Fecha en que el paquete salió: el primer evento de rastreo. Sin eventos
 * (guías manuales) solo se toma el último cambio mientras el estado siga
 * siendo «Despachado» o «Recogido»; un estado posterior ya no dice cuándo salió.
 */
export function getDispatchDate(shipment: ViewableShipment): Date | null {
  if (shipment.status === ShippingStatus.Preparing || shipment.status === ShippingStatus.Cancelled) return null;
  if (shipment.firstEventAt) return shipment.firstEventAt;
  return JUST_DISPATCHED.includes(shipment.status) ? shipment.updatedAt : null;
}

export function shipmentMatchesView(shipment: ViewableShipment, view: ShipmentView, now = new Date()): boolean {
  switch (view) {
    case "por-despachar":
      return isReadyToDispatch(shipment, now);
    case "despachados-hoy": {
      const date = getDispatchDate(shipment);
      if (!date) return false;
      const { start, end } = getColombiaDayBounds(now);
      return date >= start && date <= end;
    }
    case "en-camino":
      return IN_TRANSIT.includes(shipment.status);
    case "con-novedad":
      return WITH_ISSUE.includes(shipment.status) || isStaleInTransit(shipment, now);
    case "entregados":
      return shipment.status === ShippingStatus.Delivered;
    case "todos":
      return true;
    default:
      return false;
  }
}

export function countShipmentViews<T extends ViewableShipment>(shipments: T[], now = new Date()): Record<ShipmentView, number> {
  const counts = {} as Record<ShipmentView, number>;
  for (const { id } of SHIPMENT_VIEWS) {
    counts[id] = shipments.filter((shipment) => shipmentMatchesView(shipment, id, now)).length;
  }
  return counts;
}

export interface ShipmentStatusBadge {
  label: string;
  tone: "slate" | "lavender" | "sky" | "mint" | "pink" | "cream";
}

export function getShipmentStatusBadge(status: ShippingStatus): ShipmentStatusBadge {
  switch (status) {
    case ShippingStatus.Preparing:
      return { label: "Preparando", tone: "lavender" };
    case ShippingStatus.Shipped:
      return { label: "Despachado", tone: "sky" };
    case ShippingStatus.PickedUp:
      return { label: "Recogido", tone: "sky" };
    case ShippingStatus.InTransit:
      return { label: "En tránsito", tone: "sky" };
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
      return { label: "Cancelado", tone: "slate" };
    default:
      return { label: String(status), tone: "slate" };
  }
}

/* ---------- Lista de recogida (despacho del día) ---------- */

export interface PickingSourceShipment {
  id: string;
  trackingCode?: string | null;
  carrierName?: string | null;
  courier?: string | null;
  order: {
    orderNumber: string;
    fullName: string;
    city?: string | null;
    orderItems: { quantity: number; product: { name: string; sku: string | null } | null }[];
  };
}

export interface PickingOrder {
  shipmentId: string;
  orderNumber: string;
  fullName: string;
  city: string | null;
  carrier: string | null;
  trackingCode: string | null;
  units: number;
  items: { name: string; sku: string | null; quantity: number }[];
}

export interface PickingTotal {
  name: string;
  sku: string | null;
  quantity: number;
  orders: number;
}

export interface PickingList {
  orders: PickingOrder[];
  totals: PickingTotal[];
  units: number;
}

/** Agrupa lo que hay que empacar: por pedido y el total por producto para recoger del estante. */
export function buildPickingList(shipments: PickingSourceShipment[]): PickingList {
  const orders: PickingOrder[] = shipments
    .map((shipment) => {
      const items = shipment.order.orderItems.map((item) => ({
        name: item.product?.name ?? "Producto eliminado",
        sku: item.product?.sku ?? null,
        quantity: item.quantity,
      }));
      return {
        shipmentId: shipment.id,
        orderNumber: shipment.order.orderNumber,
        fullName: shipment.order.fullName,
        city: shipment.order.city ?? null,
        carrier: shipment.carrierName ?? shipment.courier ?? null,
        trackingCode: shipment.trackingCode ?? null,
        units: items.reduce((sum, item) => sum + item.quantity, 0),
        items,
      };
    })
    .sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

  const totalsMap = new Map<string, PickingTotal>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = item.sku ?? item.name;
      const current = totalsMap.get(key) ?? { name: item.name, sku: item.sku, quantity: 0, orders: 0 };
      current.quantity += item.quantity;
      current.orders += 1;
      totalsMap.set(key, current);
    }
  }
  const totals = Array.from(totalsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  return {
    orders,
    totals,
    units: orders.reduce((sum, order) => sum + order.units, 0),
  };
}
