import { PackageSearch } from "lucide-react";

import { ErrorState, ErrorStateLink } from "@/components/error-state";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export default function OrderNotFound() {
  return (
    <ErrorState
      tone="not-found"
      icon={PackageSearch}
      title="No encontramos este pedido"
      description="Revisa el enlace del correo de confirmación o el número de pedido. Si compraste con tu cuenta, lo verás en Mis pedidos."
      primary={<ErrorStateLink href={STOREFRONT_ROUTES.myOrders}>Ir a Mis pedidos</ErrorStateLink>}
      whatsappMessage="¡Hola! No encuentro mi pedido en la página. ¿Me ayudan?"
      secondaryLink={{ href: STOREFRONT_ROUTES.shop, label: "Ver la tienda" }}
    />
  );
}
