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

  const isGuest = !user;

  return (
    <Container>
      {/* On phones the prompt is ordered last: Clerk resolves it late, and from
          there it can only push the page's end instead of the form fields. */}
      <div className="flex w-full flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
        <div className="order-1 sm:col-start-1 sm:row-start-1">
          <h1 className="font-serif text-3xl font-bold text-blue-yankees sm:text-4xl">
            Finaliza tu compra
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {user?.firstName
              ? `¡Hola, ${user.firstName}! Tres pasos y listo.`
              : "Tres pasos, sin crear cuenta. Pago seguro."}
          </p>
        </div>
        {isGuest && (
          <div className="order-3 sm:col-start-2 sm:row-start-1 sm:min-h-[148px]">
            <AccountPrompt
              className="w-full sm:w-auto sm:max-w-md"
              variant="compact"
              source="checkout"
              redirectPath={STOREFRONT_ROUTES.checkout}
            />
          </div>
        )}
        <div className="order-2 sm:col-span-2 sm:row-start-2">
          <MultiStepCheckoutForm
            currentUser={formattedUser}
            freeShippingThreshold={storefrontSettings.freeShippingThreshold}
            isGuest={isGuest}
          />
        </div>
      </div>
    </Container>
  );
}
