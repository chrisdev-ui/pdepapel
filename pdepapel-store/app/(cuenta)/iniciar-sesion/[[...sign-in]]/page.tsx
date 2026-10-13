import { auth } from "@clerk/nextjs/server";
import { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getSafeStorefrontRedirectPath,
  STOREFRONT_ROUTES,
} from "@/lib/routes";
import { Login } from "./components/login";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description:
    "Entra a tu cuenta de Papelería P de Papel para ver tus pedidos, guías de envío y direcciones guardadas.",
  alternates: {
    canonical: STOREFRONT_ROUTES.signIn,
  },
  robots: {
    index: false,
    follow: false,
  },
};

type LoginPageProps = {
  searchParams?: {
    redirect_url?: string | string[];
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { userId } = await auth();

  if (userId) {
    redirect(getSafeStorefrontRedirectPath(searchParams?.redirect_url));
  }

  return <Login />;
}
