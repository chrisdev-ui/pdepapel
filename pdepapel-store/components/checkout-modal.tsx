"use client";

import { CreditCard, ShieldCheck } from "lucide-react";

import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useCheckoutModal } from "@/hooks/use-checkout-modal";
import { useToast } from "@/hooks/use-toast";
import axios from "axios";
import { useRouter } from "next/navigation";
import { useState } from "react";

export const CheckoutModal: React.FC<{}> = () => {
  const router = useRouter();
  const checkoutModal = useCheckoutModal();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const orderItems = useCheckoutModal((state) => state.data);

  if (!orderItems) {
    return null;
  }

  const goToCheckout = () => {
    router.push("/checkout");
    checkoutModal.onClose();
  };

  const onCheckout = async () => {
    try {
      setIsLoading(true);
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/checkout`,
        {
          items: orderItems.map((item) => ({
            productId: item.id,
            quantity: item.quantity,
          })),
        },
      );
      window.location = response.data.url;
    } catch (error) {
      setIsLoading(false);
      console.log("[CHECKOUT_ERROR]", error);
      toast({
        description: "Ups! Algo ha ido mal, por favor inténtalo de nuevo.",
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