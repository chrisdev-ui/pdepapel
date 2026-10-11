"use client";

import { WhatsappIcon } from "@/components/icons";
import { useWhatsAppContext } from "@/hooks/use-whatsapp-context";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { buildWhatsAppUrl, whatsAppAnalyticsParams, type WhatsAppPrefill } from "@/lib/whatsapp-prefill";
import { usePathname } from "next/navigation";

/**
 * Rutas donde el botón flotante estorba más de lo que ayuda: en ambas hay una
 * barra fija abajo. El carrito no se queda sin WhatsApp — se mudó dentro de
 * esa barra, que es donde la clienta ya está mirando.
 */
const HIDDEN_ON: string[] = [
  STOREFRONT_ROUTES.checkout,
  STOREFRONT_ROUTES.cart,
];

/** La misma métrica se toque desde donde se toque: página, lugar y tipo de página (sin datos personales). */
export function trackWhatsAppClick(placement: string, pagePath: string, prefill: WhatsAppPrefill = { pageType: "general" }): void {
  trackCustomerEvent("whatsapp_cta_clicked", {
    page_path: pagePath,
    placement,
    ...whatsAppAnalyticsParams(prefill),
  });
}

export function WhatsAppFloatingButton() {
  const pathname = usePathname();
  const product = useWhatsAppContext((state) => state.product);

  if (HIDDEN_ON.includes(pathname)) return null;

  const prefill: WhatsAppPrefill =
    product && pathname.startsWith(productPath(""))
      ? { pageType: "product", productName: product.name, productRef: product.ref }
      : { pageType: "general" };

  return (
    <a
      href={buildWhatsAppUrl(prefill)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chatear con Papelería P de Papel por WhatsApp"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 hover:bg-[#20bd5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#128C7E] focus-visible:ring-offset-2 motion-reduce:transform-none md:bottom-6 md:right-6"
      onClick={() => trackWhatsAppClick("floating_button", pathname, prefill)}
    >
      <WhatsappIcon aria-hidden="true" className="h-7 w-7" />
      <span className="sr-only">Abrir WhatsApp en una nueva pestaña</span>
    </a>
  );
}
