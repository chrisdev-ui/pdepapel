"use client";

import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { KAWAII_FACE_SAD } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { CartItem } from "./cart-item";
import { Summary } from "./summary";

const Cart: React.FC<{}> = () => {
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
                <Link href="/shop">
                  <Button className="mt-4">
                    {" "}
                    <ArrowLeft className="mr-2 h-5 w-5" /> Regresar a la tienda
                  </Button>
                </Link>
              </div>
            )}
            <ul>
              {cart.items?.length > 0 &&
                cart.items.map((item) => (
                  <CartItem key={item.id} item={item} />
                ))}
            </ul>
          </div>
          {cart.items?.length > 0 && <Summary />}
        </div>
      </Container>
    </>
  );
};

export default Cart;
