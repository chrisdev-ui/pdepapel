import { getOrderQueue, isAwaitingPaymentStale, type OrderQueue, type QueueableOrder } from "@/lib/order-queues";
import { OrderStatus, OrderType, ShippingStatus } from "@prisma/client";

/** Línea de tiempo y siguiente paso de la página del pedido. Puro y testeable. */

export type StepState = "done" | "now" | "todo" | "skipped";

export interface TimelineStep {
  id: "created" | "sent" | "accepted" | "paid" | "guide" | "transit" | "delivered" | "closed";
  label: string;
  state: StepState;
  meta?: string;
}

export interface TimelineOrder extends QueueableOrder {
  createdAt: Date | string;
  paidAt?: Date | string | null;
  viewedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  shipping?: {
    status: ShippingStatus;
    trackingCode?: string | null;
    trackingUrl?: string | null;
    courier?: string | null;
    carrierName?: string | null;
    guideUrl?: string | null;
    estimatedDeliveryDate?: Date | string | null;
    actualDeliveryDate?: Date | string | null;
  } | null;
}

const fmt = (value?: Date | string | null) => {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(date);
};

export function buildOrderTimeline(order: TimelineOrder, now = new Date()): TimelineStep[] {
  const queue = getOrderQueue(order, now);
  const closed = queue === "closed";
  const inStore = order.type === OrderType.POINT_OF_SALE || order.type === OrderType.FESTIVAL;
  const paid = order.status === OrderStatus.PAID || order.status === OrderStatus.SENT || queue === "completed";
  const shipping = order.shipping;
  const hasGuide = Boolean(shipping?.trackingCode);
  const delivered = shipping?.status === ShippingStatus.Delivered;
  const MOVING: ShippingStatus[] = [ShippingStatus.Shipped, ShippingStatus.PickedUp, ShippingStatus.InTransit, ShippingStatus.OutForDelivery];
  const moving = Boolean(shipping && MOVING.includes(shipping.status));

  if (order.type === OrderType.QUOTATION && queue === "quote") {
    const sent = order.status !== OrderStatus.DRAFT;
    const viewed = Boolean(order.viewedAt) || order.status === OrderStatus.VIEWED || order.status === OrderStatus.ACCEPTED;
    const accepted = order.status === OrderStatus.ACCEPTED;
    return [
      { id: "created", label: "Creada", state: "done", meta: fmt(order.createdAt) },
      { id: "sent", label: "Enviada", state: sent ? "done" : "now", meta: sent ? undefined : "Comparte el enlace con el cliente" },
      { id: "accepted", label: viewed && !accepted ? "Vista" : "Aceptada", state: accepted ? "done" : sent ? "now" : "todo", meta: accepted ? undefined : viewed ? fmt(order.viewedAt) : order.expiresAt ? `vence ${fmt(order.expiresAt)}` : undefined },
      { id: "paid", label: "Pagada", state: "todo" },
    ];
  }

  const steps: TimelineStep[] = [
    { id: "created", label: "Creado", state: "done", meta: fmt(order.createdAt) },
    {
      id: "paid",
      label: "Pagado",
      state: paid ? "done" : closed ? "skipped" : "now",
      meta: paid ? fmt(order.paidAt) ?? (inStore ? "en mostrador" : "marcado a mano") : queue === "verify" ? "Esperando el comprobante" : queue === "awaiting-payment" ? "Esperando el pago en línea" : queue === "dispatch" ? "Se cobra al entregar" : undefined,
    },
  ];

  if (inStore) {
    steps.push({ id: "delivered", label: "Entregado", state: paid ? "done" : closed ? "skipped" : "todo", meta: paid ? "en el punto de venta" : undefined });
    return closed ? [...steps, { id: "closed", label: order.status === OrderStatus.CANCELLED ? "Cancelado" : "Rechazado", state: "now" }] : steps;
  }

  steps.push({
    id: "guide",
    label: "Guía",
    state: hasGuide || moving || delivered ? "done" : closed ? "skipped" : paid || queue === "dispatch" ? "now" : "todo",
    meta: hasGuide ? [shipping?.carrierName ?? shipping?.courier, shipping?.trackingCode].filter(Boolean).join(" · ") : paid || queue === "dispatch" ? "Crea la guía con la cotización guardada" : "Se crea al confirmar el pago",
  });
  steps.push({
    id: "transit",
    label: "En camino",
    state: delivered ? "done" : moving ? "now" : closed ? "skipped" : "todo",
    meta: moving ? `${shipping?.status === ShippingStatus.OutForDelivery ? "En reparto" : "En tránsito"}${shipping?.estimatedDeliveryDate ? ` · llega ${fmt(shipping.estimatedDeliveryDate)}` : ""}` : queue === "issue" ? "Con novedad de la transportadora" : undefined,
  });
  steps.push({ id: "delivered", label: "Entregado", state: delivered ? "done" : closed ? "skipped" : "todo", meta: delivered ? fmt(shipping?.actualDeliveryDate) : undefined });
  if (closed) steps.push({ id: "closed", label: order.status === OrderStatus.CANCELLED ? "Cancelado" : "Rechazado", state: "now" });
  return steps;
}

export interface NextStepCard {
  queue: OrderQueue;
  title: string;
  description: string;
  /** Acción principal: enlace a una sección del formulario (#ancla) o a otra página. */
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
  consequence?: string;
  tone: "cream" | "sky" | "pink" | "mint" | "lavender" | "slate";
}

export function getNextStepCard(order: TimelineOrder, storeId: string, now = new Date()): NextStepCard | null {
  const queue = getOrderQueue(order, now);
  switch (queue) {
    case "verify":
      return { queue, title: "Siguiente paso: verificar la transferencia", description: "Revisa el comprobante del cliente y marca el pedido como pagado con el número de la transacción.", primary: { label: "Marcar como pagado", href: "#estado" }, consequence: "Al confirmar: se descuenta el inventario y se habilita la guía.", tone: "cream" };
    case "awaiting-payment":
      return isAwaitingPaymentStale(order, now)
        ? { queue, title: "El pago en línea no se completó", description: "Lleva más de dos horas sin pagarse: la sesión de Bold o Wompi ya venció. Reenvía el enlace por WhatsApp, cambia el método a transferencia o cancela el pedido.", primary: { label: "Reenviar enlace de pago", href: "#pago" }, secondary: { label: "Cambiar método", href: "#pago" }, consequence: "Si el cliente paga, Bold o Wompi marcarán el pedido como pagado automáticamente.", tone: "pink" }
        : { queue, title: "Esperando el pago en línea", description: "El cliente aún está en la pasarela. Si en dos horas no paga, este pedido pasará a «Por atender».", primary: { label: "Ver enlace de pago", href: "#pago" }, consequence: "Bold o Wompi marcarán el pedido como pagado automáticamente.", tone: "sky" };
    case "dispatch":
      return { queue, title: "Siguiente paso: crear la guía de envío", description: order.shipping?.courier ? `Cotización guardada con ${order.shipping.carrierName ?? order.shipping.courier}. Guarda el pedido como pagado para generar la guía.` : "Elige transportadora o registra un envío manual y guarda el pedido.", primary: { label: "Ir a envío", href: "#envio" }, consequence: "Con la guía creada podrás imprimir la etiqueta y el cliente recibirá el seguimiento.", tone: "sky" };
    case "in-transit":
      return { queue, title: "El pedido va en camino", description: [order.shipping?.carrierName ?? order.shipping?.courier, order.shipping?.trackingCode ? `guía ${order.shipping.trackingCode}` : null].filter(Boolean).join(" · ") || "Con guía creada.", primary: order.shipping?.trackingUrl ? { label: "Ver seguimiento", href: order.shipping.trackingUrl } : { label: "Ver envío", href: "#envio" }, secondary: order.shipping?.guideUrl ? { label: "Descargar guía", href: order.shipping.guideUrl } : undefined, tone: "lavender" };
    case "issue":
      return { queue, title: "Novedad de la transportadora", description: "Revisa el estado del envío y contacta al cliente para reintentar la entrega o gestionar la devolución.", primary: { label: "Ver envío", href: "#envio" }, consequence: "Una devolución no reingresa stock hasta que el producto llegue físicamente.", tone: "pink" };
    case "quote":
      return { queue, title: order.status === OrderStatus.ACCEPTED ? "Cotización aceptada" : "Cotización en curso", description: order.status === OrderStatus.ACCEPTED ? "El cliente aceptó. Conviértela en pedido registrando el pago." : order.expiresAt ? `Válida hasta ${fmt(order.expiresAt)}. Comparte el enlace o recuérdala por WhatsApp.` : "Comparte el enlace con el cliente.", primary: { label: order.status === OrderStatus.ACCEPTED ? "Registrar pago" : "Ver estado", href: "#estado" }, tone: "lavender" };
    case "delivered":
      return { queue, title: "Pedido entregado", description: "Cerrado. Puedes pedir una reseña por WhatsApp.", primary: { label: "Ver pedidos", href: `/${storeId}/pedidos` }, tone: "mint" };
    case "completed":
      return { queue, title: "Venta cobrada", description: "Registrada y cobrada. No requiere envío.", primary: { label: "Ver pedidos", href: `/${storeId}/pedidos` }, tone: "mint" };
    default:
      return null;
  }
}
