"use client";

import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

import { getProducts } from "@/actions/get-products";
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
          {cart.items?.length > 0 && <Summary disabled={checkoutDisabled} />}
        </div>
      </Container>
    </>
  );
};

export default Cart;
