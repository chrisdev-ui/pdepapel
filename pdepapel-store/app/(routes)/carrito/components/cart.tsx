"use client";

import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

import { getProducts } from "@/actions/get-products";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KAWAII_FACE_SAD } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import {
  getAnalyticsValue,
  toAnalyticsItem,
  trackCustomerEvent,
} from "@/lib/customer-analytics";
import { cn } from "@/lib/utils";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import Link from "next/link";
import { CartItem } from "./cart-item";
import { Summary } from "./summary";

const Cart: React.FC<{}> = () => {
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (!isMounted || cart.items.length === 0) return;

    const items = cart.items.map((item) =>
      toAnalyticsItem(item, item.quantity ?? 1),
    );
    trackCustomerEvent("view_cart", {
      currency: "COP",
      items,
      value: getAnalyticsValue(items),
    });
  }, [cart.items, isMounted]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const validateStock = async () => {
      if (cart.items.length === 0) return;

      const ids = cart.items.map((item) => item.id).join(",");
      // Use "products" property from response since getProducts returns { products: [...] } but strict typing check needed
      // Wait, getProducts returns ProductsResponse which has 'products' array.
      // My previous getProduct (singular) returns Product | null.
      // getProducts (plural) returns { products: Product[], pagination: ... }

      try {
        const { products } = await getProducts({ ids });

        products.forEach((product) => {
          cart.updateStock(product.id, product.stock);
        });

        // Check if any cart item was NOT returned (meaning it might be disabled/deleted)
        // Not required strictly but good practice. For now, we trust the API returns what matches.
      } catch (error) {
        console.error("Failed to validate stock", error);
      }
    };

    validateStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.items.length]); // Re-validate when item count changes (e.g. added/removed) or mount.
  // Ideally, we want to run this ONCE on mount, or when cart opens.
  // If we assume this page is the cart view.
  // Using cart.items.length is okay, but if `updateStock` triggers re-render, we need to be careful not to loop if dependency was `cart.items`.

  const checkoutDisabled = cart.items.some(
    (item) => item.stock === 0 || (item.quantity ?? 0) > item.stock,
  );

  if (!isMounted) {
    return <CartSkeleton />;
  }

  return (
    <>
      <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
        Mi Carrito
        <ShoppingBag className="ml-2 h-8 w-8" />
      </h1>
      <div className="mt-12 gap-x-12 lg:grid lg:grid-cols-12 lg:items-start">
        <div
          className={cn("lg:col-span-7", {
            "lg:col-span-12": cart.items?.length === 0,
          })}
        >
          {cart.items?.length === 0 && (
            <div className="flex w-full flex-col flex-wrap items-center sm:flex-row sm:justify-between">
              <p className="text-neutral-500">
                No tienes productos en tu carrito. {KAWAII_FACE_SAD}
              </p>
              <Link href={STOREFRONT_ROUTES.shop}>
                <Button className="mt-4">
                  <ArrowLeft className="mr-2 h-5 w-5" /> Regresar a la tienda
                </Button>
              </Link>
            </div>
          )}
          <ul>
            {cart.items?.length > 0 &&
              cart.items.map((item) => <CartItem key={item.id} item={item} />)}
          </ul>
        </div>
        {cart.items?.length > 0 && <Summary disabled={checkoutDisabled} />}
      </div>
    </>
  );
};

const CartSkeleton = () => (
  <div className="space-y-8" aria-busy="true" aria-live="polite">
    <span className="sr-only">Cargando carrito</span>
    <Skeleton className="h-10 w-52" />
    <div className="mt-12 gap-x-12 lg:grid lg:grid-cols-12">
      <div className="space-y-4 lg:col-span-7">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex gap-4 border-b py-5">
            <Skeleton className="h-24 w-24 shrink-0" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 space-y-4 rounded-xl border p-6 lg:col-span-5 lg:mt-0">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  </div>
);

export default Cart;
