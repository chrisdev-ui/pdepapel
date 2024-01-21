"use client";

import { CreditCard, ShoppingBag, ShoppingCart, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import { NoResults } from "@/components/ui/no-results";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { KAWAII_FACE_SAD } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface NavbarCartProps {
  className?: string;
}

export const NavbarCart: React.FC<NavbarCartProps> = ({ className }) => {
  const cart = useCart();
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const onRemove = (productId: string) => {
    cart.removeItem(productId);
  };

  const onGoToCart = () => {
    setIsSheetOpen(false);
    router.push("/cart");
  };

  const onCheckout = () => {
    setIsSheetOpen(false);
    router.push("/checkout");
  };

  const totalQuantity = cart.items.reduce(
    (total, item) => total + Number(item.quantity ?? 1),
    0,
  );

  const totalPrice = cart.items.reduce(
    (total, item) => total + Number(item.price) * Number(item.quantity ?? 1),
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
          <span className="ml-2 flex pt-1 font-serif text-base font-medium">
            {totalQuantity}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        variant="cart"
        className="flex w-full max-w-full flex-col p-0 sm:max-w-sm lg:max-w-md"
      >
        <SheetTitle className="flex w-full items-center justify-center bg-white-rock p-5 font-serif">
          Carrito de compras
        </SheetTitle>
        <div className="flex grow flex-col justify-between overflow-y-auto overflow-x-hidden px-6 py-0">
          <div className="flex h-full w-full flex-col gap-4">
            {cart.items.length === 0 && (
              <NoResults
                message={`No hay productos en el carrito ${KAWAII_FACE_SAD}`}
              />
            )}
            {cart.items.length > 0 &&
              cart.items.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-[80px_1fr] gap-2.5"
                >
                  <Link
                    href={`/product/${item.id}`}
                    className="relative h-20 w-20"
                  >
                    <Image
                      src={item.images[0].url}
                      alt={item.name ?? "Imagen del producto"}
                      fill
                      sizes="(max-width: 640px) 80px, 120px"
                      priority
                      className="rounded-md"
                    />
                    <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-yankees font-serif text-xs text-white">
                      {item.quantity}
                    </span>
                  </Link>
                  <div className="flex max-h-20 items-center justify-between">
                    <div className="flex h-full flex-col items-start justify-between">
                      <div className="flex flex-col text-left font-serif text-sm font-medium tracking-tight">
                        <span>{item.name}</span>
                        <span className="text-xs text-gray-400">{`Diseño: ${item.design.name}`}</span>
                        <span className="hidden text-xs text-gray-400 lg:block">{`Categoría: ${item.category.name}`}</span>
                      </div>
                      <Currency className="text-lg" value={item.price} />
                    </div>
                    <button
                      className="group h-8 w-8 rounded-full bg-gray-200 text-blue-yankees/50 hover:bg-white-rock hover:text-blue-yankees"
                      onClick={() => onRemove(item.id)}
                    >
                      <X className="m-auto h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
          {cart.items.length > 0 && (
            <Button
              className="w-fit self-center bg-gray-400/30 p-2 text-gray-500/60 hover:bg-gray-400 hover:text-gray-500"
              onClick={() => cart.removeAll()}
            >
              Limpiar carrito
            </Button>
          )}
        </div>
        <SheetFooter className="grid w-full grid-cols-1 grid-rows-2 gap-6 border-t border-green-leaf p-6 sm:space-x-0">
          <div className="flex w-full items-center justify-between text-2xl">
            <span>Subtotal</span>
            <Currency value={totalPrice} />
          </div>
          <div className="flex w-full flex-col gap-3 lg:flex-row">
            <Button
              className="group relative w-full overflow-hidden bg-green-leaf font-serif text-base font-bold uppercase text-white hover:bg-green-leaf lg:w-1/2"
              onClick={onGoToCart}
            >
              <ShoppingCart className="absolute left-0 h-5 w-5 -translate-x-full transform transition-transform duration-500 ease-out group-hover:translate-x-20" />
              <span className="group-hover:hidden">Ver Carrito</span>
            </Button>
            <Button
              className="group relative w-full overflow-hidden bg-pink-shell font-serif text-base font-bold uppercase text-white hover:bg-pink-shell lg:w-1/2"
              disabled={cart.items.length === 0}
              onClick={onCheckout}
            >
              <CreditCard className="absolute left-0 h-5 w-5 -translate-x-full transform transition-transform duration-500 ease-out group-hover:translate-x-20" />
              <span className="group-hover:hidden">Finalizar compra</span>
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
