import { auth } from "@clerk/nextjs/server";
import { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getSafeStorefrontRedirectPath,
  STOREFRONT_ROUTES,
} from "@/lib/routes";
import { Register } from "./components/register";

export const metadata: Metadata = {
  title: "Crear cuenta",
  description:
    "Crea tu cuenta gratis en Papelería P de Papel para guardar pedidos, direcciones y favoritos.",
  alternates: {
    canonical: STOREFRONT_ROUTES.signUp,
  },
  robots: {
    index: false,
    follow: false,
  },
};

type RegisterPageProps = {
  searchParams?: {
    redirect_url?: string | string[];
  };
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { userId } = await auth();

  if (userId) {
    redirect(getSafeStorefrontRedirectPath(searchParams?.redirect_url));
  }

  return <Register />;
}
