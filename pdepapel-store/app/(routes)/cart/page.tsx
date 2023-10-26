"use client";

import { ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

import { Container } from "@/components/ui/container";
import { KAWAII_FACE_SAD } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { CartItem } from "./components/cart-item";
import { Summary } from "./components/summary";

export default function CartPage() {
  const cart = useCart();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Mi Carrito
          <ShoppingBag className="ml-2 h-8 w-8" />
        </h1>
        <div className="mt-12 gap-x-12 lg:grid lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-7">
            {cart.items?.length === 0 && (
              <p className="text-neutral-500">
                No tienes productos en tu carrito. {KAWAII_FACE_SAD}
              </p>
            )}
            <ul>
              {cart.items?.length > 0 &&
                cart.items.map((item) => (
                  <CartItem key={item.id} item={item} />
                ))}
            </ul>
          </div>
          <Summary />
        </div>
      </Container>
    </>
  );
}
