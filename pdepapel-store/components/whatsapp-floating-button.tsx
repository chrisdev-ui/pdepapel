"use client";

import { WhatsappIcon } from "@/components/icons";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { usePathname } from "next/navigation";

export const WHATSAPP_URL =
  "https://wa.me/573132582293?text=%C2%A1Hola%21%20Encontr%C3%A9%20su%20contacto%20en%20la%20p%C3%A1gina%20web.%20Me%20gustar%C3%ADa%20consultar%20sobre%E2%80%A6";

/**
 * Rutas donde el botón flotante estorba más de lo que ayuda: en ambas hay una
 * barra fija abajo. El carrito no se queda sin WhatsApp — se mudó dentro de
 * esa barra, que es donde la clienta ya está mirando.
 */
const HIDDEN_ON: string[] = [
  STOREFRONT_ROUTES.checkout,
  STOREFRONT_ROUTES.cart,
];

/** El mismo enlace y la misma métrica se toque desde donde se toque. */
export function trackWhatsAppClick(placement: string, pagePath: string): void {
  trackCustomerEvent("whatsapp_cta_clicked", {
    page_path: pagePath,
    placement,
  });
}

export function WhatsAppFloatingButton() {
  const pathname = usePathname();

  if (HIDDEN_ON.includes(pathname)) return null;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chatear con Papelería P de Papel por WhatsApp"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:scale-105 hover:bg-[#20bd5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#128C7E] focus-visible:ring-offset-2 motion-reduce:transform-none md:bottom-6 md:right-6"
      onClick={() => trackWhatsAppClick("floating_button", pathname)}
    >
      <WhatsappIcon aria-hidden="true" className="h-7 w-7" />
      <span className="sr-only">Abrir WhatsApp en una nueva pestaña</span>
    </a>
  );
}
