import { Metadata } from "next";

import { AccountHub } from "@/components/account/account-hub";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description:
    "Tus pedidos, direcciones guardadas, favoritos y búsquedas en Papelería P de Papel.",
  alternates: {
    canonical: STOREFRONT_ROUTES.account,
  },
  robots: {
    index: false,
    follow: false,
  },
};

// The middleware redirects signed-out visitors to /iniciar-sesion with a
// safe redirect_url before this page renders.
export default function AccountPage() {
  return <AccountHub />;
}
