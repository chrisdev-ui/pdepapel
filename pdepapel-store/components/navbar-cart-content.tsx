"use client";

import { CreditCard, ShoppingBag, ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { Button } from "@/components/ui/button";
import { AccountPrompt } from "@/components/account-prompt";
import { CldImage } from "@/components/ui/CldImage";
import { Currency } from "@/components/ui/currency";
import { NoResults } from "@/components/ui/no-results";
import {
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { KAWAII_FACE_SAD } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { toAnalyticsItem, trackCustomerEvent } from "@/lib/customer-analytics";
import { getCustomerFacingProductOptions } from "@/lib/product-options";
import { calculateTotals } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface NavbarCartContentProps {
  onClose: () => void;
}

export const NavbarCartContent: React.FC<NavbarCartContentProps> = ({
  onClose,
}) => {
  const cart = useCart();
  const router = useRouter();
  const hasTrackedCartViewRef = useRef(false);
  const { total } = useMemo(
    () => calculateTotals(cart.items, null),
    [cart.items],
  );

  useEffect(() => {
    if (hasTrackedCartViewRef.current || cart.items.length === 0) return;

    hasTrackedCartViewRef.current = true;
    const items = cart.items.map((item) =>
      toAnalyticsItem(item, item.quantity ?? 1),
    );
    trackCustomerEvent("view_cart", {
      cart_surface: "drawer",
      currency: "COP",
      items,
      value: Number(total),
    });
  }, [cart.items, total]);

  const onGoToCart = () => {
    onClose();
    router.push(STOREFRONT_ROUTES.cart);
  };

  const onCheckout = () => {
    trackCustomerEvent("checkout_initiated", {
      currency: "COP",
      items: cart.items.map((item) => toAnalyticsItem(item, item.quantity)),
      item_count: cart.items.length,
      total: Number(total),
    });
    onClose();
    router.push(STOREFRONT_ROUTES.checkout);
  };

  return (
    <SheetContent
      variant="cart"
      className="h-dvh max-h-dvh flex w-full max-w-full flex-col overscroll-contain p-0 sm:max-w-sm lg:max-w-md"
    >
      <SheetTitle className="text-balance flex w-full shrink-0 items-center justify-center bg-blue-baby px-14 py-5 font-quicksand text-xl font-semibold">
        Carrito de compras
      </SheetTitle>
      <SheetDescription className="sr-only">
        Resumen de tu carrito de compras
      </SheetDescription>
      <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-5 sm:px-6">
        <div className="flex w-full flex-col gap-5">
          {cart.items.length === 0 && (
            <NoResults
              message={`No hay productos en el carrito ${KAWAII_FACE_SAD}`}
            />
          )}
          {cart.items.length > 0 &&
            cart.items.map((item) => (
              <div key={item.id} className="grid grid-cols-[80px_1fr] gap-2.5">
                <Link
                  href={productPath(item.slug || item.id)}
                  className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md bg-gray-100"
                  onClick={onClose}
                >
                  {(item.images.find((image) => image.isMain)?.url ??
                  item.images[0]?.url) ? (
                    <CldImage
                      src={
                        item.images.find((image) => image.isMain)?.url ??
                        item.images[0]!.url
                      }
                      alt={item.name ?? "Imagen del producto"}
                      fill
                      sizes="(max-width: 640px) 80px, 120px"
                      className="object-cover"
                    />
                  ) : (
                    <>
                      <ShoppingBag
                        aria-hidden="true"
                        className="h-7 w-7 text-gray-400"
                      />
                      <span className="sr-only">Sin imagen disponible</span>
                    </>
                  )}
                  <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-blue-yankees font-serif text-xs text-white">
                    {item.quantity}
                  </span>
                </Link>
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col text-left font-serif text-sm font-medium tracking-tight">
                      <span className="line-clamp-2" title={item.name}>
                        {item.name}
                      </span>
                      {item.design && (
                        <span className="line-clamp-1 text-xs text-gray-400">{`Diseño: ${item.design.name}`}</span>
                      )}
                      {item.color && (
                        <span className="line-clamp-1 text-xs text-gray-400">{`Color: ${item.color.name}`}</span>
                      )}
                      {getCustomerFacingProductOptions(item).map((option) => (
                        <span
                          key={`${option.name}-${option.value}`}
                          className="line-clamp-1 text-xs text-gray-400"
                        >
                          {option.name}: {option.value}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Currency className="text-lg" value={item.price} />
                      {(item.hasDiscount ||
                        (item.originalPrice &&
                          item.originalPrice > Number(item.price))) && (
                        <span className="animate-pulse rounded bg-pink-froly px-1.5 py-0.5 text-[10px] font-semibold text-white motion-reduce:animate-none">
                          Oferta
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Eliminar ${item.name} del carrito`}
                    className="group flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full bg-gray-200 text-blue-yankees/60 transition-colors hover:bg-blue-baby hover:text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink focus-visible:ring-offset-2"
                    onClick={() => cart.removeItem(item.id)}
                  >
                    <X aria-hidden="true" className="m-auto h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
        {cart.items.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-5 w-fit self-center font-quicksand font-medium text-gray-600"
            onClick={() => cart.removeAll()}
          >
            Limpiar carrito
          </Button>
        )}
      </div>
      <footer className="flex max-h-[60dvh] w-full shrink-0 flex-col gap-3 overflow-y-auto overscroll-contain border-t border-blue-purple/40 bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 sm:px-6">
        <div className="flex w-full items-center justify-between font-quicksand text-lg font-semibold">
          <span>Subtotal</span>
          <Currency value={total} />
        </div>
        {cart.items.length > 0 && (
          <AccountPrompt
            variant="compact"
            source="cart_drawer"
            redirectPath={STOREFRONT_ROUTES.cart}
          />
        )}
        <div className="grid w-full grid-cols-1 gap-2.5 xxs:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full border-blue-purple/40 bg-background px-3 font-quicksand text-sm font-semibold normal-case text-blue-yankees hover:bg-blue-purple/10"
            onClick={onGoToCart}
          >
            <ShoppingCart aria-hidden="true" className="mr-2 h-4 w-4" />
            Ver carrito
          </Button>
          <Button
            type="button"
            className="h-11 w-full bg-blue-yankees px-3 font-quicksand text-sm font-semibold normal-case text-white hover:bg-blue-yankees/90"
            disabled={cart.items.length === 0}
            onClick={onCheckout}
          >
            <CreditCard aria-hidden="true" className="mr-2 h-4 w-4" />
            Finalizar compra
          </Button>
        </div>
      </footer>
    </SheetContent>
  );
};
