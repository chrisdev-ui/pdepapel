import { auth } from "@clerk/nextjs";
import { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getSafeStorefrontRedirectPath,
  STOREFRONT_ROUTES,
} from "@/lib/routes";
import { Register } from "./components/register";

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

type RegisterPageProps = {
  searchParams?: {
    redirect_url?: string | string[];
  };
};

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  const { userId } = auth();

  if (userId) {
    redirect(getSafeStorefrontRedirectPath(searchParams?.redirect_url));
  }

  return <Register />;
}
