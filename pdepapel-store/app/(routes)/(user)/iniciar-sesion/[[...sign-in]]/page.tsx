import { auth } from "@clerk/nextjs";
import { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getSafeStorefrontRedirectPath,
  STOREFRONT_ROUTES,
} from "@/lib/routes";
import { Login } from "./components/login";

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

type LoginPageProps = {
  searchParams?: {
    redirect_url?: string | string[];
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const { userId } = auth();

  if (userId) {
    redirect(getSafeStorefrontRedirectPath(searchParams?.redirect_url));
  }

  return <Login />;
}
