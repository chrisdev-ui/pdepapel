import { OrderStatus, PaymentMethod, ShippingStatus } from "@/constants";
import type { Order, Shipping } from "@/types";

/**
 * One customer-facing vocabulary for an order, shared by the order detail,
 * the order history and every email or toast that names a state. It folds
 * the payment status (`Order.status`) and the carrier status
 * (`Shipping.status`) into the single thing the customer wants to know:
 * "what is happening with my order and what do I do next".
 */
export type OrderStage =
  | "unpaid"
  | "verifying"
  | "cod"
  | "paid"
  | "shipped"
  | "delivered"
  | "issue"
  | "cancelled";

export type StageTone = "warning" | "info" | "success" | "danger" | "neutral";

export interface OrderStageInfo {
  stage: OrderStage;
  /** Short label for chips and filters ("En camino"). */
  label: string;
  /** One sentence for the detail header. */
  description: string;
  tone: StageTone;
}

const IN_TRANSIT_STATUSES: ReadonlySet<string> = new Set([
  ShippingStatus.Shipped,
  ShippingStatus.PickedUp,
  ShippingStatus.InTransit,
  ShippingStatus.OutForDelivery,
]);

const ISSUE_STATUSES: ReadonlySet<string> = new Set([
  ShippingStatus.FailedDelivery,
  ShippingStatus.Exception,
  ShippingStatus.Returned,
  ShippingStatus.Cancelled,
]);

type StageSource = Pick<Order, "status"> & {
  payment?: Pick<Order["payment"], "method"> | null;
  shipping?: Pick<Shipping, "status" | "provider"> | null;
};

export function getOrderStage(order: StageSource): OrderStageInfo {
  const paymentMethod = order.payment?.method;
  const shippingStatus = order.shipping?.status;

  if (order.status === OrderStatus.CANCELLED) {
    return {
      stage: "cancelled",
      label: "Cancelado",
      description:
        "Este pedido se canceló. Si ya habías pagado, escríbenos y te ayudamos con el reembolso.",
      tone: "neutral",
    };
  }

  if (order.status === OrderStatus.PAID) {
    if (shippingStatus === ShippingStatus.Delivered) {
      return {
        stage: "delivered",
        label: "Entregado",
        description: "Tu pedido ya fue entregado. ¡Esperamos que lo disfrutes!",
        tone: "success",
      };
    }
    if (shippingStatus && ISSUE_STATUSES.has(shippingStatus)) {
      return {
        stage: "issue",
        label:
          shippingStatus === ShippingStatus.Returned
            ? "Devuelto"
            : "Novedad en la entrega",
        description:
          shippingStatus === ShippingStatus.Returned
            ? "El paquete volvió a nosotros. Escríbenos para coordinar un nuevo envío."
            : "La transportadora reportó una novedad. Escríbenos y la resolvemos contigo.",
        tone: "danger",
      };
    }
    if (shippingStatus && IN_TRANSIT_STATUSES.has(shippingStatus)) {
      return {
        stage: "shipped",
        label: "En camino",
        description: "Tu pedido ya salió. Sigue la guía para saber por dónde va.",
        tone: "info",
      };
    }
    return {
      stage: "paid",
      label:
        order.shipping?.provider === "NONE"
          ? "Pagado · listo para retirar pronto"
          : "Pagado · en preparación",
      description:
        order.shipping?.provider === "NONE"
          ? "Recibimos tu pago. Te avisamos cuando puedas retirar tu pedido."
          : "Recibimos tu pago y estamos empacando tu pedido. Te avisamos cuando salga.",
      tone: "success",
    };
  }

  if (paymentMethod === PaymentMethod.COD) {
    return {
      stage: "cod",
      label: "Pagas al recibir",
      description:
        "Pagarás en efectivo cuando la transportadora entregue tu pedido.",
      tone: "info",
    };
  }

  if (
    order.status === OrderStatus.PENDING ||
    paymentMethod === PaymentMethod.BankTransfer
  ) {
    return {
      stage: "verifying",
      label:
        paymentMethod === PaymentMethod.BankTransfer
          ? "Transferencia por verificar"
          : "Pago en proceso",
      description:
        paymentMethod === PaymentMethod.BankTransfer
          ? "Cuando recibamos tu comprobante confirmamos el pago y empezamos a preparar el pedido."
          : "Estamos confirmando tu pago con la pasarela. Suele tardar unos minutos.",
      tone: "warning",
    };
  }

  return {
    stage: "unpaid",
    label: "Por pagar",
    description:
      "Tu pedido está reservado. Completa el pago para que empecemos a prepararlo.",
    tone: "warning",
  };
}

/** Whether the customer still has to pay this order online. */
export function isAwaitingPayment(order: StageSource): boolean {
  const { stage } = getOrderStage(order);
  return stage === "unpaid" || stage === "verifying";
}

/** Every carrier status has a Spanish label; unknown values are shown as-is. */
export const SHIPPING_STATUS_LABELS: Record<ShippingStatus, string> = {
  [ShippingStatus.Preparing]: "En preparación",
  [ShippingStatus.Shipped]: "Despachado",
  [ShippingStatus.PickedUp]: "Recogido por la transportadora",
  [ShippingStatus.InTransit]: "En tránsito",
  [ShippingStatus.OutForDelivery]: "En reparto",
  [ShippingStatus.Delivered]: "Entregado",
  [ShippingStatus.FailedDelivery]: "Intento de entrega fallido",
  [ShippingStatus.Returned]: "Devuelto",
  [ShippingStatus.Cancelled]: "Envío cancelado",
  [ShippingStatus.Exception]: "Novedad en el envío",
};

export function getShippingStatusLabel(
  status: string | null | undefined,
): string {
  if (!status) return SHIPPING_STATUS_LABELS[ShippingStatus.Preparing];
  return SHIPPING_STATUS_LABELS[status as ShippingStatus] ?? status;
}

export type TimelineStepState = "done" | "current" | "pending" | "issue";

export interface TimelineStep {
  id: "created" | "paid" | "shipped" | "delivered";
  label: string;
  state: TimelineStepState;
  /** ISO date when the step happened, when it is known. */
  date?: string | null;
  /** Extra line under the label (carrier status or a hint). */
  detail?: string;
}

type TimelineSource = StageSource & {
  createdAt: string;
  paidAt?: string | null;
  shipping?:
    | (Pick<Shipping, "status" | "provider"> &
        Partial<
          Pick<
            Shipping,
            "createdAt" | "updatedAt" | "actualDeliveryDate" | "trackingCode"
          >
        >)
    | null;
};

/**
 * Four customer-facing milestones. Dates are only shown when they are known
 * for that milestone: the old page repeated the shipping record's creation
 * date on every step, which made it look like everything happened at once.
 */
export function getOrderTimeline(order: TimelineSource): TimelineStep[] {
  const { stage } = getOrderStage(order);
  const shippingStatus = order.shipping?.status;
  const pickup = order.shipping?.provider === "NONE";

  const paidDone =
    stage === "paid" ||
    stage === "shipped" ||
    stage === "delivered" ||
    stage === "issue";
  const shippedDone = stage === "shipped" || stage === "delivered";
  const deliveredDone = stage === "delivered";

  const shippingDate =
    order.shipping?.trackingCode && order.shipping?.updatedAt
      ? order.shipping.updatedAt
      : null;

  const steps: TimelineStep[] = [
    {
      id: "created",
      label: "Pedido creado",
      state: "done",
      date: order.createdAt,
    },
    {
      id: "paid",
      label: stage === "cod" ? "Pago al recibir" : "Pago confirmado",
      state: paidDone
        ? "done"
        : stage === "cancelled"
          ? "pending"
          : stage === "cod"
            ? "pending"
            : "current",
      date: paidDone ? (order.paidAt ?? null) : null,
      detail:
        stage === "verifying"
          ? "Esperando la verificación del pago"
          : stage === "unpaid"
            ? "Pendiente de pago"
            : undefined,
    },
    {
      id: "shipped",
      label: pickup ? "Listo para retirar" : "Enviado",
      state: shippedDone
        ? "done"
        : stage === "issue"
          ? "issue"
          : paidDone
            ? "current"
            : "pending",
      date: shippedDone || stage === "issue" ? shippingDate : null,
      detail:
        stage === "issue"
          ? getShippingStatusLabel(shippingStatus)
          : stage === "shipped"
            ? getShippingStatusLabel(shippingStatus)
            : stage === "paid" && !pickup
              ? "Sale en 1 día hábil"
              : undefined,
    },
    {
      id: "delivered",
      label: pickup ? "Retirado" : "Entregado",
      state: deliveredDone
        ? "done"
        : shippedDone
          ? "current"
          : "pending",
      date: deliveredDone ? (order.shipping?.actualDeliveryDate ?? null) : null,
    },
  ];

  if (stage === "cancelled") {
    return steps.map((step) =>
      step.id === "created" ? step : { ...step, state: "pending" },
    );
  }

  // Delivered orders have every milestone complete; when the API skipped a
  // status (delivered without a shipped update) keep the line consistent.
  if (deliveredDone) {
    return steps.map((step) => ({ ...step, state: "done" }));
  }

  return steps;
}

const isHttpUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Public tracking page for a shipment, or null when there is nothing to
 * link to (the old page rendered `href="#"` links in that case).
 */
export function getTrackingUrl(
  shipping:
    | Pick<Shipping, "provider" | "trackingCode" | "trackingUrl">
    | null
    | undefined,
): string | null {
  if (!shipping?.trackingCode) return null;
  if (shipping.provider === "ENVIOCLICK") {
    return `https://www.envioclick.com/co/track/${encodeURIComponent(
      shipping.trackingCode,
    )}`;
  }
  return isHttpUrl(shipping.trackingUrl) ? shipping.trackingUrl : null;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [PaymentMethod.COD]: "Pago contra entrega",
  [PaymentMethod.BankTransfer]: "Transferencia bancaria",
  [PaymentMethod.Bold]: "Pago en línea",
  [PaymentMethod.Wompi]: "Pago en línea",
  [PaymentMethod.PayU]: "Pago en línea",
};

export function getPaymentMethodLabel(method: string | null | undefined) {
  if (!method) return "Pago en línea";
  return PAYMENT_METHOD_LABELS[method] ?? "Pago en línea";
}

const SUPPORT_WHATSAPP_NUMBER = "573132582293";

/** WhatsApp chat with the order number already in the first message. */
export function getOrderSupportWhatsAppUrl(orderNumber: string): string {
  const text = `¡Hola! Tengo una duda sobre mi pedido ${orderNumber}.`;
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

/** Count of units across the order, for "3 productos" style summaries. */
export function countOrderUnits(order: Pick<Order, "orderItems">): number {
  return order.orderItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity) || 1),
    0,
  );
}

export function formatUnits(count: number): string {
  return `${count.toLocaleString("es-CO")} ${count === 1 ? "producto" : "productos"}`;
}
