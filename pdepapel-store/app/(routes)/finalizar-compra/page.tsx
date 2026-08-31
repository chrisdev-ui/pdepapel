import { SignedIn, currentUser } from "@clerk/nextjs";
import { CheckCircle } from "lucide-react";
import { Metadata } from "next";

import { AccountPrompt } from "@/components/account-prompt";
import { BoldCheckoutSdk } from "@/components/bold-checkout-sdk";
import { Container } from "@/components/ui/container";
import { KAWAII_FACE_WELCOME } from "@/constants";
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

import { getCurrentSeason } from "@/lib/date-utils";
import { normalizeOrder } from "@/lib/normalization";
import { UnifiedOrder } from "@/types/unified-order";

const getCustomOrder = async (token: string): Promise<UnifiedOrder | null> => {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/public/custom-orders/${token}`,
    { cache: "no-store" }, // Ensure we always get the latest status
  );
  if (!res.ok) return null;
  const data = await res.json();
  const normalized = normalizeOrder(data);
  return { ...normalized, token }; // Ensure token is always present from URL
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { customOrderToken?: string };
}) {
  const user = await currentUser();
  const formattedUser = {
    firstName: user?.firstName,
    lastName: user?.lastName,
    telephone: user?.phoneNumbers[0]?.phoneNumber,
    email: user?.emailAddresses[0]?.emailAddress,
  };
  const currentSeason = getCurrentSeason();

  const customOrderToken = searchParams.customOrderToken;
  let customOrder: UnifiedOrder | null = null;

  if (customOrderToken) {
    customOrder = await getCustomOrder(customOrderToken);
  }

  return (
    <>
      <BoldCheckoutSdk />
      <Container>
        <div className="flex w-full flex-col items-center justify-between sm:flex-row">
          <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
            {customOrder
              ? "Finalizar cotización"
              : "Ya casi completas tu orden…"}
            <CheckCircle
              aria-hidden="true"
              className="h-8 w-8 text-green-500 sm:ml-2"
            />
          </h1>
          <AccountPrompt
            className="mt-4 w-full sm:mt-0 sm:w-auto sm:max-w-md"
            variant="compact"
            source="checkout"
            redirectPath={STOREFRONT_ROUTES.checkout}
          />
          <SignedIn>
            <span className="text-lg text-pink-froly">
              ¡Hola, {user?.firstName}! {KAWAII_FACE_WELCOME}
            </span>
          </SignedIn>
        </div>
        <MultiStepCheckoutForm
          currentUser={formattedUser}
          season={currentSeason}
          customOrder={customOrder}
        />
      </Container>
    </>
  );
}
