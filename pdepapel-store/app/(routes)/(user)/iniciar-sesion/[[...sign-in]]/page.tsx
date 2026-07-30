import { Metadata } from "next";
import { Login } from "./components/login";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Iniciar Sesión",
  description: "Iniciar Sesión en el sitio de Papelería P de Papel",
  alternates: {
    canonical: STOREFRONT_ROUTES.signIn,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return <Login />;
}
