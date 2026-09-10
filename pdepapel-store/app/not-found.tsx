import { SearchX } from "lucide-react";

import { ErrorState, ErrorStateLink } from "@/components/error-state";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/** Root 404: any path that matches nothing, plus every `notFound()` without a closer boundary. */
export default function NotFound() {
  return (
    <ErrorState
      tone="not-found"
      icon={SearchX}
      title="No encontramos esta página"
      description="Puede que el enlace esté mal escrito o que ese producto ya no exista. Lo que buscas sigue en la tienda."
      primary={<ErrorStateLink href={STOREFRONT_ROUTES.shop}>Ir a la tienda</ErrorStateLink>}
      whatsappMessage="¡Hola! Busqué una página en la tienda y no aparece. ¿Me ayudan a encontrarla?"
      secondaryLink={{ href: STOREFRONT_ROUTES.home, label: "Volver al inicio" }}
    />
  );
}
