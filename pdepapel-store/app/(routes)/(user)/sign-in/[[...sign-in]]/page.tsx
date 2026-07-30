import { Metadata } from "next";
import { Login } from "./components/login";

export const metadata: Metadata = {
  title: "Iniciar Sesión",
  description: "Iniciar Sesión en el sitio de Papelería P de Papel",
  alternates: {
    canonical: "/sign-in",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  return <Login />;
}
