import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

/**
 * Transiciones de estado de un pedido, en un solo lugar: la API las hace
 * cumplir y el formulario solo muestra las acciones que existen. Puro y
 * testeable.
 */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: "Borrador",
  QUOTATION: "Cotización enviada",
  VIEWED: "Cotización vista",
  ACCEPTED: "Cotización aceptada",
  REJECTED: "Cotización rechazada",
  CREATED: "Creado",
  PENDING: "Pendiente de pago",
  PAID: "Pagado",
  SENT: "Enviado",
  CANCELLED: "Cancelado",
};

/** Estados en los que el dinero ya entró: los productos son un registro histórico. */
export const PAID_LIKE_STATUSES: OrderStatus[] = [OrderStatus.PAID, OrderStatus.SENT];

export function isPaidLike(status: OrderStatus): boolean {
  return PAID_LIKE_STATUSES.includes(status);
}

export interface TransitionContext {
  type: OrderType;
  paymentMethod?: PaymentMethod | null;
}

const QUOTE_OPEN: OrderStatus[] = [OrderStatus.QUOTATION, OrderStatus.VIEWED];
export const ONLINE_METHODS: PaymentMethod[] = [PaymentMethod.Bold, PaymentMethod.Wompi, PaymentMethod.PayU];

/** Estados a los que puede pasar un pedido desde `from`. */
export function getAllowedTransitions(from: OrderStatus, context: TransitionContext): OrderStatus[] {
  const isQuote = context.type === OrderType.QUOTATION;
  const isCod = context.paymentMethod === PaymentMethod.COD;
  switch (from) {
    case OrderStatus.DRAFT:
      return [...(isQuote ? [OrderStatus.QUOTATION] : []), OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.CANCELLED];
    case OrderStatus.QUOTATION:
    case OrderStatus.VIEWED:
      return [OrderStatus.ACCEPTED, OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.REJECTED, OrderStatus.DRAFT, OrderStatus.CANCELLED];
    case OrderStatus.ACCEPTED:
      return [OrderStatus.PAID, OrderStatus.PENDING, OrderStatus.REJECTED, OrderStatus.CANCELLED];
    case OrderStatus.REJECTED:
      return [OrderStatus.QUOTATION, OrderStatus.DRAFT, OrderStatus.CANCELLED];
    case OrderStatus.CREATED:
    case OrderStatus.PENDING:
      return [OrderStatus.PAID, ...(isCod ? [OrderStatus.SENT] : []), OrderStatus.CANCELLED];
    case OrderStatus.PAID:
      return [OrderStatus.SENT, OrderStatus.CANCELLED];
    case OrderStatus.SENT:
      return [...(isCod ? [OrderStatus.PAID] : []), OrderStatus.CANCELLED];
    case OrderStatus.CANCELLED:
      return [OrderStatus.PENDING, ...(isQuote ? [OrderStatus.DRAFT] : [])];
    default:
      return [];
  }
}

export function canTransition(from: OrderStatus, to: OrderStatus, context: TransitionContext): boolean {
  if (from === to) return true;
  return getAllowedTransitions(from, context).includes(to);
}

/** Mensaje para la persona que intentó una transición no permitida. */
export function describeForbiddenTransition(from: OrderStatus, to: OrderStatus): string {
  if (isPaidLike(from) && !isPaidLike(to) && to !== OrderStatus.CANCELLED) {
    return `Un pedido ${ORDER_STATUS_LABELS[from].toLowerCase()} solo puede pasar a enviado o cancelarse. Para revertir un pago, cancela el pedido (el inventario vuelve) y crea uno nuevo.`;
  }
  return `No se puede pasar de «${ORDER_STATUS_LABELS[from]}» a «${ORDER_STATUS_LABELS[to]}».`;
}

export interface StatusAction {
  to: OrderStatus;
  label: string;
  /** Acción principal (botón oscuro). */
  primary: boolean;
  /** Pide confirmación antes de ejecutarse y, si aplica, una referencia de pago. */
  confirm: "pay" | "ship" | "cancel" | null;
  /** Va en la zona de cuidado en lugar de la tarjeta de estado. */
  destructive: boolean;
}

/**
 * Acciones que el formulario ofrece desde el estado actual. Marcar como
 * pagado siempre confirma (descuenta inventario y fija la fecha de pago);
 * marcar como enviado pide guía; cancelar vive en la zona de cuidado.
 */
export function getStatusActions(from: OrderStatus, context: TransitionContext & { quoteOpen?: boolean }): StatusAction[] {
  const allowed = getAllowedTransitions(from, context);
  const isQuote = context.type === OrderType.QUOTATION;
  const isCod = context.paymentMethod === PaymentMethod.COD;
  const isOnline = ONLINE_METHODS.includes(context.paymentMethod as PaymentMethod);
  const actions: StatusAction[] = [];
  const push = (to: OrderStatus, label: string, primary = false, confirm: StatusAction["confirm"] = null, destructive = false) => {
    if (allowed.includes(to)) actions.push({ to, label, primary, confirm, destructive });
  };

  switch (from) {
    case OrderStatus.DRAFT:
      if (isQuote) push(OrderStatus.QUOTATION, "Enviar cotización", true);
      else push(OrderStatus.PENDING, "Activar pedido", true);
      push(OrderStatus.PAID, "Marcar como pagado", false, "pay");
      break;
    case OrderStatus.QUOTATION:
    case OrderStatus.VIEWED:
      push(OrderStatus.ACCEPTED, "Marcar aceptada", true);
      push(OrderStatus.PAID, "Marcar como pagada", false, "pay");
      push(OrderStatus.PENDING, "Convertir en pedido");
      push(OrderStatus.REJECTED, "Marcar rechazada");
      push(OrderStatus.DRAFT, "Volver a borrador");
      break;
    case OrderStatus.ACCEPTED:
      push(OrderStatus.PAID, "Registrar pago", true, "pay");
      push(OrderStatus.PENDING, "Convertir en pedido pendiente");
      push(OrderStatus.REJECTED, "Marcar rechazada");
      break;
    case OrderStatus.REJECTED:
      push(OrderStatus.QUOTATION, "Reabrir cotización", true);
      push(OrderStatus.DRAFT, "Volver a borrador");
      break;
    case OrderStatus.CREATED:
    case OrderStatus.PENDING:
      // Con pago en línea la pasarela confirma sola: marcar a mano es la excepción, no el botón principal.
      push(OrderStatus.PAID, isCod ? "Registrar pago (cobrado al entregar)" : isOnline ? "Registrar pago a mano" : "Marcar como pagado", !isCod && !isOnline, "pay");
      if (isCod) push(OrderStatus.SENT, "Marcar como enviado", true, "ship");
      break;
    case OrderStatus.PAID:
      if (!QUOTE_OPEN.includes(from)) push(OrderStatus.SENT, "Marcar como enviado", true, "ship");
      break;
    case OrderStatus.SENT:
      if (isCod) push(OrderStatus.PAID, "Registrar pago (cobrado al entregar)", true, "pay");
      break;
    case OrderStatus.CANCELLED:
      push(OrderStatus.PENDING, "Reactivar como pendiente", true);
      break;
  }
  push(OrderStatus.CANCELLED, isPaidLike(from) ? "Cancelar y devolver el inventario" : "Cancelar pedido", false, "cancel", true);
  return actions;
}
