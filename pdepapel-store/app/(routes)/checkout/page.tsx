import { SignedIn, SignedOut, currentUser } from "@clerk/nextjs";
import { CheckCircle, User2 } from "lucide-react";
import { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { KAWAII_FACE_WELCOME } from "@/constants";
import { CheckoutForm } from "./components/checkout-form";

export const metadata: Metadata = {
  title: "Finaliza tu compra",
  description:
    "Completa tu pedido fácilmente en Papelería P de Papel. Tu carrito está lleno de alegría con nuestros artículos kawaii y de oficina. Proceso seguro y sencillo para que tu experiencia de compra sea perfecta. ¡Estás a un paso de agregar color y diversión a tu espacio!",
  alternates: {
    canonical: "/checkout",
  },
};

export default async function CheckoutPage() {
  const user = await currentUser();
  const formattedUser = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    telephone: user?.phoneNumbers[0]?.phoneNumber,
  };
  return (
    <>
      <Container>
        <div className="flex w-full flex-col items-center justify-between sm:flex-row">
          <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
            Ya casi completas tu orden...
            <CheckCircle className="h-8 w-8 text-green-500 sm:ml-2" />
          </h1>
          <SignedOut>
            <div className="flex items-center gap-3">
              <span>Tienes una cuenta?</span>
              <Link href="/sign-in?redirect_url=/checkout">
                <Button className="bg-pink-froly">
                  <User2 className="mr-2 h-4 w-4" /> Inicia sesión
                </Button>
              </Link>
            </div>
          </SignedOut>
          <SignedIn>
            <span className="text-lg text-pink-froly">
              ¡Hola, {user?.firstName}! {KAWAII_FACE_WELCOME}
            </span>
          </SignedIn>
        </div>
        <CheckoutForm currentUser={formattedUser} />
      </Container>
    </>
  );
}
