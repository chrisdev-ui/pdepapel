import { Metadata } from "next";
import { Register } from "./components/register";

export const metadata: Metadata = {
  title: "Registrarse",
  description: "Registrarse en el sitio de Papelería P de Papel",
  alternates: {
    canonical: "/register",
  },
};

export default function RegisterPage() {
  <Register />;
}
