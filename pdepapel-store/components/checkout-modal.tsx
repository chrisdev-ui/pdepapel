"use client";

import axios from "axios";
import { CreditCard, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useCheckoutModal } from "@/hooks/use-checkout-modal";
import { useGuestUser } from "@/hooks/use-guest-user";
import { useToast } from "@/hooks/use-toast";
import { env } from "@/lib/env.mjs";
import { generateGuestId } from "@/lib/utils";
import { useAuth } from "@clerk/nextjs";

export const CheckoutModal: React.FC<{}> = () => {
  const { userId } = useAuth();
  const router = useRouter();
  const checkoutModal = useCheckoutModal();
  const { guestId, setGuestId, clearGuestId } = useGuestUser();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const orderItems = useCheckoutModal((state) => state.data);

  if (!orderItems) {
    return null;
  }

  const goToCheckout = () => {
    router.push("/checkout");
    if (checkoutModal.callback) checkoutModal.callback();
    checkoutModal.onClose();
  };

  const onCheckout = async () => {
    const isUserLoggedIn = Boolean(userId);
    let guestUserId = guestId;
    if (!isUserLoggedIn && !guestUserId) {
      guestUserId = generateGuestId();
      setGuestId(guestUserId);
    }
    try {
      setIsLoading(true);
      const response = await axios.post(
        `${env.NEXT_PUBLIC_API_URL}/checkout/stripe`,
        {
          items: orderItems.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          userId: isUserLoggedIn ? userId : null,
          guestId: isUserLoggedIn ? null : guestUserId,
        },
      );
      window.location = response.data.url;
    } catch (error: any) {
      console.log("[CHECKOUT_ERROR]", error);
      toast({
        description:
          error.response?.data.message || "Error al procesar el pago",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal open={checkoutModal.isOpen} onClose={checkoutModal.onClose}>
      <div className="flex w-full flex-col items-center justify-center gap-2">
        <CreditCard className="h-12 w-12 text-blue-yankees" />
        <h2 className="font-serif text-2xl font-bold">Completar tu compra</h2>
        <div className="mt-4 w-full text-center">
          <div>
            Recuerda que al aceptar esta opción se te hará el cobro mediante una{" "}
            <span className="text-red-500">tarjeta de crédito</span> sin
            necesidad de crear una cuenta.
            <div className="my-3">
              <span className="text-red-500">NOTA:</span> Si quieres utilizar
              otro medio de pago puedes seleccionar continuar tu pedido y
              escoger una opción diferente.
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-1 gap-5 md:grid-cols-2">
          <Button onClick={goToCheckout} disabled={isLoading}>
            Continuar tu pedido
            <ShieldCheck className="ml-3 h-6 w-6 text-white" />
          </Button>
          <Button onClick={onCheckout} disabled={isLoading}>
            Pagar con tarjeta{" "}
            <Icons.creditCards className="ml-3 w-6 text-white" />
          </Button>
        </div>
      </div>
    </Modal>
  );
};
