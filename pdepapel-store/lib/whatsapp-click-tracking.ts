/**
 * `whatsapp_click`: every tap on a WhatsApp link in the store, wherever it is
 * built (prefill helper, settings number, hard-coded wa.me). One delegated
 * listener reads it, so a new link is measured without remembering to.
 * Consent is enforced by trackCustomerEvent. No path is sent: order pages
 * carry the order id in the URL; only the page type and where the link sat.
 */

const WHATSAPP_HOSTS = new Set(["wa.me", "api.whatsapp.com", "web.whatsapp.com", "chat.whatsapp.com"]);

/** Links whose own handler already sent the event (floating button, cart bar). */
export const WHATSAPP_TRACKED_ATTRIBUTE = "data-whatsapp-tracked";

export function isWhatsAppHref(href: string | null | undefined): boolean {
  if (!href) return false;
  if (href.startsWith("whatsapp:")) return true;
  try {
    return WHATSAPP_HOSTS.has(new URL(href, "https://papeleriapdepapel.com").hostname);
  } catch {
    return false;
  }
}

const PAGE_TYPES: Record<string, string> = {
  "": "home",
  producto: "product",
  categoria: "category",
  tienda: "shop",
  marcas: "brand",
  carrito: "cart",
  "finalizar-compra": "checkout",
  pedido: "order",
  contacto: "contact",
  politicas: "policy",
  nosotros: "about",
  favoritos: "wishlist",
  cuenta: "account",
  capsulas: "capsules",
  "tarjeta-regalo": "gift_card",
};

export function whatsAppPageType(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return PAGE_TYPES[first] ?? "other";
}

/** Where the link sat: an explicit `data-ui-source`, else the footer or header, else the page. */
export function whatsAppUiSource(anchor: Element, pathname: string): string {
  const marked = anchor.closest("[data-ui-source]")?.getAttribute("data-ui-source");
  if (marked) return marked.slice(0, 40);
  if (anchor.closest("footer")) return "footer";
  if (anchor.closest("header, nav")) return "header";
  return `page_${whatsAppPageType(pathname)}`;
}

/** The event for a click, or null when it was not on an untracked WhatsApp link. */
export function whatsAppClickEvent(target: EventTarget | null, pathname: string): { ui_source: string; page_type: string } | null {
  if (!target || typeof (target as Element).closest !== "function") return null;
  const anchor = (target as Element).closest("a[href]");
  if (!anchor || !isWhatsAppHref(anchor.getAttribute("href"))) return null;
  if (anchor.hasAttribute(WHATSAPP_TRACKED_ATTRIBUTE)) return null;
  return { ui_source: whatsAppUiSource(anchor, pathname), page_type: whatsAppPageType(pathname) };
}
