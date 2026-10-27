import type { OrderStatus, ShippingStatus } from "@prisma/client";

import { shippingOptions } from "@/constants";
import { ORDER_STATUS_LABELS } from "@/lib/order-transitions";

/**
 * «Cambiar estado sin avisar»: el panel cambia el estado de un pedido sin
 * mandarle correo ni WhatsApp a la clienta, y deja constancia en
 * `OrderNotification` (SKIPPED). Este archivo no toca la base: lo usa
 * también la tarjeta «Avisos a la clienta» en el navegador.
 */
export const SILENT_CHANGE_PREFIX = "estado:";
export const SILENT_CHANGE_REASON = "Cambio de estado sin avisar";

const MILESTONE_MAX = 40;
const DEDUPE_MAX = 191;

/** `notifyCustomer` del cuerpo: ausente es `true`; cualquier cosa que no sea booleana es un error. */
export function parseNotifyCustomer(body: unknown): boolean | null {
  if (!body || typeof body !== "object" || !("notifyCustomer" in body)) return true;
  const value = (body as { notifyCustomer?: unknown }).notifyCustomer;
  if (value === undefined) return true;
  return typeof value === "boolean" ? value : null;
}

export function silentChangeMilestone(status: OrderStatus | ShippingStatus): string {
  return `${SILENT_CHANGE_PREFIX}${status}`.slice(0, MILESTONE_MAX);
}

export function silentChangeDedupeKey(orderId: string, now = Date.now(), random = Math.random()): string {
  const suffix = random.toString(36).slice(2, 8).padEnd(6, "0");
  return `silent:${orderId}:${now}:${suffix}`.slice(0, DEDUPE_MAX);
}

export function isSilentChangeMilestone(milestone: string): boolean {
  return milestone.startsWith(SILENT_CHANGE_PREFIX);
}

/** «Cambio de estado sin avisar (Pagado)»; para un estado del envío, «(Envío: Entregado)». */
export function silentChangeLabel(milestone: string): string {
  const key = milestone.slice(SILENT_CHANGE_PREFIX.length);
  const order = (ORDER_STATUS_LABELS as Record<string, string>)[key];
  const shipping = (shippingOptions as Record<string, string>)[key];
  const readable = order ?? (shipping ? `Envío: ${shipping}` : key);
  return `${SILENT_CHANGE_REASON} (${readable})`;
}
