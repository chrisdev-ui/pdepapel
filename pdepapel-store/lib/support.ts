/** The shop's WhatsApp line, shared by every "escríbenos" link. */
export const SUPPORT_WHATSAPP_NUMBER = "573132582293";

/** WhatsApp chat with the first message already written. */
export function getSupportWhatsAppUrl(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
