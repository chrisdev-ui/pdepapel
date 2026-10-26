import { WhatsAppOptInSource } from "@prisma/client";

/**
 * Consentimiento para avisos del pedido por WhatsApp. Sin él no sale ningún
 * mensaje de WhatsApp sobre el pedido; el correo sale siempre.
 *
 * La versión es la del texto de la casilla: si cambia el texto, cambia la
 * versión aquí y en la tienda (`pdepapel-store/lib/whatsapp-opt-in.ts`), y la
 * administración sigue aceptando las anteriores para los checkouts abiertos.
 */
export const WHATSAPP_OPT_IN_VERSION = "2026-10-26";
export const WHATSAPP_OPT_IN_TEXT = "Recibir avisos de mi pedido por WhatsApp";
const KNOWN_VERSIONS = new Set([WHATSAPP_OPT_IN_VERSION]);

export function parseWhatsAppOptIn(value: unknown): { version: string } | null {
  if (!value || typeof value !== "object") return null;
  const version = (value as { version?: unknown }).version;
  return typeof version === "string" && KNOWN_VERSIONS.has(version) ? { version } : null;
}

/**
 * Las columnas del pedido cuando la casilla viene marcada en el checkout. La
 * dueña creando un pedido desde la tienda no consiente por nadie.
 */
export function orderWhatsAppOptInData(input: { isStoreOwner: boolean; whatsappOptIn: unknown; now?: Date }) {
  if (input.isStoreOwner || input.whatsappOptIn === undefined || input.whatsappOptIn === null || input.whatsappOptIn === false) return {};
  const parsed = parseWhatsAppOptIn(input.whatsappOptIn);
  if (!parsed) {
    console.warn("[WHATSAPP_OPT_IN] Versión desconocida en el checkout; el pedido queda sin avisos por WhatsApp.");
    return {};
  }
  return {
    whatsappOptInAt: input.now ?? new Date(),
    whatsappOptInVersion: parsed.version,
    whatsappOptInSource: WhatsAppOptInSource.CHECKOUT,
  };
}

export function canSendWhatsAppOrderUpdates(input: {
  settings: { whatsappOrderUpdatesEnabled: boolean } | null | undefined;
  order: { whatsappOptInAt: Date | null; whatsappOptOutAt: Date | null };
}): boolean {
  return Boolean(input.settings?.whatsappOrderUpdatesEnabled && input.order.whatsappOptInAt && !input.order.whatsappOptOutAt);
}

/** El panel solo anota el consentimiento de pedidos que nacieron en WhatsApp. */
export function canRecordChatOptIn(input: { source: string | null; hasWhatsAppConversation: boolean }): boolean {
  return input.source === "WHATSAPP" || input.hasWhatsAppConversation;
}
