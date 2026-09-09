"use client";

import { AccountPrompt } from "@/components/account-prompt";
import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { useCart } from "@/hooks/use-cart";
import { calculateTotals } from "@/lib/utils";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

interface SummaryProps {
  disabled?: boolean;
}

export const Summary: React.FC<SummaryProps> = ({ disabled }) => {
  const router = useRouter();
  const items = useCart((state) => state.items);

  const goToCheckout = () => {
    router.push(STOREFRONT_ROUTES.checkout);
  };

  const { total, productSavings } = useMemo(
    () => calculateTotals(items, null),
    [items],
  );

  return (
    <div className="mt-16 rounded-lg bg-blue-baby/20 px-4 py-6 sm:p-6 lg:col-span-5 lg:mt-0 lg:p-8">
      <h2 className="font-serif text-lg font-medium">Resumen del pedido</h2>
      <div className="mt-6 space-y-4">
        <SavingsRow formattedSavings={productSavings} />
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="text-2xl font-medium">Total</div>
          <Currency value={total} />
        </div>
      </div>
      <AccountPrompt
        className="mt-6"
        source="cart_page"
        redirectPath={STOREFRONT_ROUTES.cart}
      />
      <Button
        onClick={goToCheckout}
        disabled={items.length === 0 || disabled}
        className="mt-6 h-11 w-full rounded-full bg-blue-yankees font-quicksand text-base font-semibold text-white transition-colors hover:bg-blue-yankees/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CreditCard aria-hidden="true" className="mr-2 h-5 w-5" />
        Finalizar compra
      </Button>
      {items.length > 0 && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-3 right-[5.25rem] z-40 lg:hidden">
          <div className="flex h-14 items-center gap-3 rounded-full bg-white pl-4 pr-1.5 shadow-[0_8px_24px_rgba(34,27,65,0.22)] ring-1 ring-blue-baby">
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-sans text-xs text-gray-500">Total</span>
              <Currency value={total} className="text-[15px] font-bold" />
            </span>
            <Button
              onClick={goToCheckout}
              disabled={disabled}
              className="ml-auto h-11 rounded-full bg-blue-yankees px-5 font-quicksand text-sm font-semibold text-white"
            >
              Finalizar compra
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const SavingsRow = ({ formattedSavings }: { formattedSavings: number }) => {
  if (formattedSavings <= 0) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
      <div className="font-quicksand text-base font-semibold text-gray-600">
        Ahorros en ofertas
      </div>
      <Currency
        value={formattedSavings}
        className="font-quicksand text-lg font-bold text-success"
      />
    </div>
  );
};
