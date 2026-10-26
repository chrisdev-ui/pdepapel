/**
 * La casilla «Recibir avisos de mi pedido por WhatsApp» del checkout. La
 * versión es la del texto: si cambia el texto, cambia aquí y en la
 * administración (`pdepapel-admin/lib/whatsapp-opt-in.ts`), que guarda la
 * versión con la hora y rechaza una que no conoce.
 */
export const WHATSAPP_OPT_IN_VERSION = "2026-10-26";
export const WHATSAPP_OPT_IN_LABEL = "Recibir avisos de mi pedido por WhatsApp";

/** Solo viaja si la marcó: sin casilla no hay nada que guardar. */
export function whatsappOptInPayload(checked: boolean): { version: string } | undefined {
  return checked ? { version: WHATSAPP_OPT_IN_VERSION } : undefined;
}
