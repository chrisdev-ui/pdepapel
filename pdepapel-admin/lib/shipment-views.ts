import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

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

/** Origen de la guía, en el mismo español del formulario de pedido («Recoge en tienda» = sin transportadora). */
export const PROVIDER_LABELS: Record<ShippingProvider, string> = {
  [ShippingProvider.ENVIOCLICK]: "EnvioClick",
  [ShippingProvider.MANUAL]: "Manual",
  [ShippingProvider.NONE]: "Recoge en tienda",
};

export function getShipmentProviderLabel(provider: ShippingProvider): string {
  return PROVIDER_LABELS[provider] ?? String(provider);
}

const SHORT_DATE = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

/** «12 sept», en hora de Bogotá; null sin fecha. Para la columna y la tarjeta «Llega». */
export function formatShortDate(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return SHORT_DATE.format(value);
}

/* ---------- Lista de recogida (despacho del día) ---------- */

export interface PickingSourceComponent {
  quantity: number;
  component: { id?: string | null; name: string; sku: string | null };
}

export interface PickingSourceItem {
  quantity: number;
  /** Snapshot del pedido (`OrderItem.name`/`sku`): sobrevive al producto y es lo único que tiene un ítem manual. */
  name?: string | null;
  sku?: string | null;
  productId?: string | null;
  product?: {
    name: string;
    sku: string | null;
    isKit?: boolean;
    kitComponents?: PickingSourceComponent[];
  } | null;
}

export interface PickingSourceShipment {
  id: string;
  trackingCode?: string | null;
  carrierName?: string | null;
  courier?: string | null;
  order: {
    orderNumber: string;
    fullName: string;
    city?: string | null;
    orderItems: PickingSourceItem[];
  };
}

export interface PickingComponent {
  name: string;
  sku: string | null;
  /** Cantidad total a recoger: la del componente en el kit × la de la línea. */
  quantity: number;
}

export interface PickingItem {
  name: string;
  sku: string | null;
  quantity: number;
  /** Solo en kits: lo que trae cada línea, ya multiplicado. */
  components?: PickingComponent[];
}

export interface PickingOrder {
  shipmentId: string;
  orderNumber: string;
  fullName: string;
  city: string | null;
  carrier: string | null;
  trackingCode: string | null;
  units: number;
  items: PickingItem[];
}

export interface PickingTotal {
  name: string;
  sku: string | null;
  quantity: number;
  /** Pedidos distintos que llevan el producto. */
  orders: number;
}

export interface PickingList {
  orders: PickingOrder[];
  totals: PickingTotal[];
  units: number;
}

const MANUAL_ITEM_LABEL = "Ítem manual";
const DELETED_PRODUCT_LABEL = "Producto eliminado";

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** Nombre y SKU de una línea: primero el snapshot del pedido, luego el producto, y al final un rótulo honesto. */
export function resolvePickingItemIdentity(item: PickingSourceItem): { name: string; sku: string | null } {
  const name = clean(item.name) ?? clean(item.product?.name) ?? (item.productId ? DELETED_PRODUCT_LABEL : MANUAL_ITEM_LABEL);
  const sku = clean(item.sku) ?? clean(item.product?.sku);
  return { name, sku };
}

function explodeKit(item: PickingSourceItem): PickingComponent[] | undefined {
  const components = item.product?.isKit ? item.product.kitComponents : undefined;
  if (!components || components.length === 0) return undefined;
  return components.map((entry) => ({
    name: clean(entry.component.name) ?? DELETED_PRODUCT_LABEL,
    sku: clean(entry.component.sku),
    quantity: entry.quantity * item.quantity,
  }));
}

/**
 * Envíos que entran en la lista de recogida. Sin selección imprime toda la
 * cola; con selección, solo los seleccionados que además estén en la cola,
 * así el botón de la cabecera y el de la selección cuentan lo mismo.
 */
export function pickingTargets<T extends { id: string }>(dispatch: T[], selectedIds?: string[] | null): T[] {
  if (!selectedIds) return dispatch;
  const wanted = new Set(selectedIds);
  return dispatch.filter((shipment) => wanted.has(shipment.id));
}

/**
 * Agrupa lo que hay que empacar: por pedido (la línea del kit con sus
 * componentes debajo) y el total por producto para recoger del estante, donde
 * los kits ya vienen explotados en sus componentes.
 */
export function buildPickingList(shipments: PickingSourceShipment[]): PickingList {
  const totalsMap = new Map<string, PickingTotal & { orderIds: Set<string> }>();
  const addTotal = (key: string, name: string, sku: string | null, quantity: number, shipmentId: string) => {
    const current = totalsMap.get(key) ?? { name, sku, quantity: 0, orders: 0, orderIds: new Set<string>() };
    current.quantity += quantity;
    current.orderIds.add(shipmentId);
    totalsMap.set(key, current);
  };

  const orders: PickingOrder[] = shipments
    .map((shipment) => {
      const items: PickingItem[] = shipment.order.orderItems.map((item) => {
        const { name, sku } = resolvePickingItemIdentity(item);
        const components = explodeKit(item);
        if (components) {
          components.forEach((component, index) => {
            const source = item.product?.kitComponents?.[index]?.component;
            addTotal(source?.id ?? component.sku ?? component.name, component.name, component.sku, component.quantity, shipment.id);
          });
          return { name, sku, quantity: item.quantity, components };
        }
        addTotal(item.productId ?? sku ?? name, name, sku, item.quantity, shipment.id);
        return { name, sku, quantity: item.quantity };
      });
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

  const totals: PickingTotal[] = Array.from(totalsMap.values())
    .map(({ orderIds, ...total }) => ({ ...total, orders: orderIds.size }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    orders,
    totals,
    units: orders.reduce((sum, order) => sum + order.units, 0),
  };
}
