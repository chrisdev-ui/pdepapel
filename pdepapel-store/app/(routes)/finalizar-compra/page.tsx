import { currentUser } from "@clerk/nextjs/server";
import { Metadata } from "next";

import { AccountPrompt } from "@/components/account-prompt";
import { Container } from "@/components/ui/container";
import { getStorefrontSettings } from "@/actions/get-storefront-settings";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { MultiStepCheckoutForm } from "./components/multi-step-checkout-form";

export const metadata: Metadata = {
  title: "Finaliza tu compra",
  description:
    "Completa tu pedido fácilmente en Papelería P de Papel. Tu carrito está lleno de alegría con nuestros artículos kawaii y de oficina. Proceso seguro y sencillo para que tu experiencia de compra sea perfecta. ¡Estás a un paso de agregar color y diversión a tu espacio!",
  alternates: {
    canonical: STOREFRONT_ROUTES.checkout,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CheckoutPage() {
  const [user, storefrontSettings] = await Promise.all([
    currentUser(),
    getStorefrontSettings(),
  ]);
  const formattedUser = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    telephone: user?.phoneNumbers[0]?.phoneNumber,
    email: user?.emailAddresses[0]?.emailAddress,
  };

  return (
    <Container>
      <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-blue-yankees sm:text-4xl">
            Finaliza tu compra
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.firstName
              ? `¡Hola, ${user.firstName}! Tres pasos y listo.`
              : "Tres pasos, sin crear cuenta. Pago seguro."}
          </p>
        </div>
        {!user && (
          <AccountPrompt
            className="w-full sm:w-auto sm:max-w-md"
            variant="compact"
            source="checkout"
            redirectPath={STOREFRONT_ROUTES.checkout}
          />
        )}
      </div>
      <MultiStepCheckoutForm
        currentUser={formattedUser}
        freeShippingThreshold={storefrontSettings.freeShippingThreshold}
      />
    </Container>
  );
}
