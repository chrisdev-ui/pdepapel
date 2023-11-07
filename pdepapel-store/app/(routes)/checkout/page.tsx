import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { KAWAII_FACE_WELCOME } from "@/constants";
import { SignedIn, SignedOut, currentUser } from "@clerk/nextjs";
import { CheckCircle, User2 } from "lucide-react";
import Link from "next/link";
import { CheckoutForm } from "./components/checkout-form";

export default async function CheckoutPage() {
  const user = await currentUser();
  return (
    <>
      <Container>
        <div className="flex w-full items-center justify-between">
          <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
            Ya casi completas tu orden...
            <CheckCircle className="ml-2 h-8 w-8 text-green-500" />
          </h1>
          <SignedOut>
            <div className="flex items-center gap-3">
              <span>Tienes una cuenta?</span>
              <Link href="/login?redirect_url=/checkout">
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
        <CheckoutForm />
      </Container>
    </>
  );
}
