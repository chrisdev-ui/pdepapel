/**
 * Texto prellenado del botón de WhatsApp según la página. El bot del panel lo
 * reconoce (pdepapel-admin/lib/whatsapp/web-origin.ts) para saludar según de
 * dónde viene la clienta: si se cambia un texto aquí, hay que cambiar ese
 * reconocedor en el mismo despliegue. Nunca lleva nombres, correos,
 * teléfonos, direcciones ni totales: solo el nombre del producto, su
 * referencia pública (el SKU que ya se ve en la ficha) o el número de pedido.
 */
export const STORE_WHATSAPP_NUMBER = "573132582293";

export type WhatsAppPrefill =
  | { pageType: "product"; productName: string; productRef: string }
  | { pageType: "cart"; productRefs: (string | null | undefined)[] }
  | { pageType: "order"; orderNumber: string }
  | { pageType: "general" };

/** Tope de largo del mensaje antes de codificarlo. */
export const WHATSAPP_PREFILL_MAX_LENGTH = 200;
/** Más referencias que estas en el carrito van como «y más». */
export const WHATSAPP_CART_MAX_REFS = 5;

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

/** Corta un nombre largo por palabras, sin dejar media palabra. */
export function truncateName(name: string, max: number): string {
  const text = clean(name);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:(-]+$/, "")}…`;
}

export function buildWhatsAppPrefillText(prefill: WhatsAppPrefill): string {
  switch (prefill.pageType) {
    case "product": {
      const ref = clean(prefill.productRef);
      const frame = (name: string) => `¡Hola! 👋 Vengo de la tienda web y me interesa: ${name} (ref ${ref}).`;
      const room = WHATSAPP_PREFILL_MAX_LENGTH - frame("").length;
      return frame(truncateName(prefill.productName, Math.max(room, 20)));
    }
    case "cart": {
      const refs = Array.from(new Set(prefill.productRefs.filter((ref): ref is string => typeof ref === "string").map(clean).filter(Boolean)));
      if (refs.length === 0) return "¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito.";
      const shown = refs.slice(0, WHATSAPP_CART_MAX_REFS).join(", ");
      const more = refs.length > WHATSAPP_CART_MAX_REFS ? " y más" : "";
      return `¡Hola! 👋 Vengo de la tienda web, tengo una duda con mi carrito (ref ${shown}${more}).`;
    }
    case "order":
      return `¡Hola! 👋 Tengo una pregunta sobre mi pedido #${clean(prefill.orderNumber)} de la tienda web.`;
    default:
      return "¡Hola! 👋 Vengo de la tienda web y quiero hacer una consulta.";
  }
}

export function buildWhatsAppUrl(prefill: WhatsAppPrefill): string {
  return `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppPrefillText(prefill))}`;
}

/** Lo que va a GA4 con el clic: el tipo de página y, si hay, la referencia del producto. */
export function whatsAppAnalyticsParams(prefill: WhatsAppPrefill): { page_type: string; product_ref: string | null } {
  return {
    page_type: prefill.pageType,
    product_ref: prefill.pageType === "product" ? clean(prefill.productRef) : null,
  };
}
