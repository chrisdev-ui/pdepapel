"use client";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { useCart } from "@/hooks/use-cart";
import { calculateTotals } from "@/lib/utils";
import { CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

export const Summary: React.FC<{}> = () => {
  const router = useRouter();
  const items = useCart((state) => state.items);

  const goToCheckout = () => {
    router.push("/checkout");
  };

  const { total, productSavings } = useMemo(
    () => calculateTotals(items, null),
    [items],
  );

  return (
    <div className="mt-16 rounded-lg bg-blue-baby/20 px-4 py-6 sm:p-6 lg:col-span-5 lg:mt-0 lg:p-8">
      <h2 className="font-serif text-lg font-medium">Resumen del pedido</h2>
      <div className="mt-6 space-y-4">
        {productSavings > 0 ? (
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="text-base text-gray-600">Ahorros en ofertas</div>
            <Currency
              value={productSavings}
              className="font-serif text-lg text-success"
            />
          </div>
        ) : null}
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-2xl font-medium">Total</div>
          <Currency value={total} />
        </div>
      </div>
      <Button
        onClick={goToCheckout}
        disabled={items.length === 0}
        className="group relative mt-6 w-full overflow-hidden rounded-full bg-blue-yankees font-serif text-base font-bold uppercase text-white hover:bg-blue-yankees"
      >
        <CreditCard className="absolute left-0 h-5 w-5 -translate-x-full transform transition-transform duration-500 ease-out group-hover:translate-x-64" />
        <span className="transition-opacity duration-150 group-hover:opacity-0">
          Completar pedido
        </span>
      </Button>
    </div>
  );
};
