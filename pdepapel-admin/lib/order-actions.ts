/**
 * Puente entre la cabecera del pedido (siguiente paso) y las acciones de
 * estado del formulario: la cabecera pide una acción y la tarjeta de Pago la
 * abre. Un evento del DOM evita acoplar los dos componentes con contexto.
 */

import type { NextStepAction } from "@/lib/order-timeline";

export const ORDER_ACTION_EVENT = "pdepapel:order-action";

export interface OrderActionEventDetail {
  action: NextStepAction;
}

export function requestOrderAction(action: NextStepAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OrderActionEventDetail>(ORDER_ACTION_EVENT, { detail: { action } }));
}

/** Desplaza la vista hasta un ancla del formulario (`#pago`, `#envio`…). */
export function scrollToOrderSection(href: string): void {
  if (typeof document === "undefined" || !href.startsWith("#")) return;
  const target = document.getElementById(href.slice(1));
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}
