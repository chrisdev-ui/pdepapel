import { SignUp } from "@clerk/nextjs";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registrarse",
  description: "Registrarse en el sitio de Papelería P de Papel",
  alternates: {
    canonical: "/sign-up",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RegisterPage() {
  <SignUp />;
}
