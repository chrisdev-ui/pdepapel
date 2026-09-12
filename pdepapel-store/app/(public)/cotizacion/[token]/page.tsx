import { FileClock } from "lucide-react";
import type { Metadata } from "next";

import { ErrorState, ErrorStateLink } from "@/components/error-state";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Cotización no disponible",
  robots: { index: false, follow: false },
};

/**
 * Las cotizaciones por enlace se retiraron en 2026-09. Los enlaces antiguos
 * siguen en chats de WhatsApp, así que la ruta responde con una explicación y
 * una salida en vez de un 404. No consulta la API ni lee el token.
 */
export default function RetiredQuotePage() {
  return (
    <ErrorState
      tone="not-found"
      icon={FileClock}
      title="Esta cotización ya no está disponible"
      description="Las cotizaciones por enlace se retiraron. Si todavía te interesan esos productos, escríbenos por WhatsApp y te ayudamos a armar tu pedido."
      primary={
        <ErrorStateLink href={STOREFRONT_ROUTES.shop}>
          Ir a la tienda
        </ErrorStateLink>
      }
      whatsappMessage="¡Hola! Tenía una cotización por enlace y ya no está disponible. ¿Me ayudan a retomar ese pedido?"
      secondaryLink={{ href: STOREFRONT_ROUTES.home, label: "Volver al inicio" }}
    />
  );
}
