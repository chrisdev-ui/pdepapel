import { SignUp } from "@clerk/nextjs";
import { Metadata } from "next";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Registrarse",
  description: "Registrarse en el sitio de Papelería P de Papel",
  alternates: {
    canonical: STOREFRONT_ROUTES.signUp,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RegisterPage() {
  return <SignUp />;
}
