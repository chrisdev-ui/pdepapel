"use client";

import { ShoppingBag } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "@/hooks/use-cart";
import { cn } from "@/lib/utils";

const NavbarCartContent = dynamic(
  () =>
    import("@/components/navbar-cart-content").then(
      (module) => module.NavbarCartContent,
    ),
  { ssr: false },
);

interface NavbarCartProps {
  className?: string;
}

export const NavbarCart: React.FC<NavbarCartProps> = ({ className }) => {
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const totalQuantity = cart.items.reduce(
    (total, item) => total + Number(item.quantity ?? 1),
    0,
  );

  return (
    <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
      <SheetTrigger asChild>
        <Button
          className={cn(
            "flex w-auto items-center rounded-full border-transparent bg-blue-yankees px-4 py-2 font-semibold text-white transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <ShoppingBag className="h-5 w-5" />
          <span className="ml-2 flex font-sans text-base font-medium">
            {totalQuantity}
          </span>
        </Button>
      </SheetTrigger>
      {isSheetOpen && (
        <NavbarCartContent onClose={() => setIsSheetOpen(false)} />
      )}
    </Sheet>
  );
};
