"use client";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { useCart } from "@/hooks/use-cart";
import { useToast } from "@/hooks/use-toast";
import { CreditCard } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export const Summary: React.FC<{}> = () => {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const router = useRouter();
  const items = useCart((state) => state.items);
  const [isLoading, setIsLoading] = useState(false);
  const removeAll = useCart((state) => state.removeAll);

  useEffect(() => {
    if (searchParams.get("success")) {
      toast({
        description: "Pago realizado con éxito, gracias por tu compra!",
        variant: "success",
      });
      removeAll();
    }
    if (searchParams.get("canceled")) {
      toast({
        description: "Pago cancelado, no se ha realizado ningún cargo.",
        variant: "destructive",
      });
    }
  }, [removeAll, searchParams, toast]);

  const goToCheckout = () => {
    router.push("/checkout");
  };

  const totalPrice = items.reduce(
    (total, item) => total + Number(item.price) * Number(item.quantity ?? 1),
    0,
  );

  return (
    <div className="mt-16 rounded-lg bg-white-rock/20 px-4 py-6 sm:p-6 lg:col-span-5 lg:mt-0 lg:p-8">
      <h2 className="font-serif text-lg font-medium">Resumen del pedido</h2>
      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-2xl font-medium">Total</div>
          <Currency value={totalPrice} />
        </div>
      </div>
      <Button
        onClick={goToCheckout}
        disabled={items.length === 0}
        className="group relative mt-6 w-full overflow-hidden rounded-full bg-blue-yankees font-serif text-base font-bold uppercase text-white hover:bg-blue-yankees"
      >
        <CreditCard className="absolute left-0 h-5 w-5 -translate-x-full transform transition-transform duration-500 ease-out group-hover:translate-x-64" />
        <span className="transition-opacity duration-150 group-hover:opacity-0">
          Finalizar compra
        </span>
      </Button>
    </div>
  );
};
