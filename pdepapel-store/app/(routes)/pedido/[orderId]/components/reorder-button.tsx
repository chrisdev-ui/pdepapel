"use client";

import { RotateCcw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useCartSheet } from "@/hooks/use-cart-sheet";
import { useToast } from "@/hooks/use-toast";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { cn } from "@/lib/utils";
import { useCartPreview } from "@/providers/cart-preview-provider";
import type { OrderItem, Product } from "@/types";

interface ReorderButtonProps {
  orderItems: OrderItem[];
  className?: string;
  size?: "default" | "sm";
}

/** Products that still exist in the catalog and can be bought again. */
export function getReorderableItems(orderItems: OrderItem[]) {
  return orderItems.flatMap((item) => {
    const product = item.product;
    if (!product || product.isArchived || product.stock <= 0) return [];
    return [{ product, quantity: Math.max(1, Number(item.quantity) || 1) }];
  });
}

/**
 * Adds every product of a past order to the cart at today's price. Items that
 * are archived or sold out are skipped and reported, never silently dropped.
 */
export function ReorderButton({
  orderItems,
  className,
  size = "default",
}: ReorderButtonProps) {
  const addItem = useCart((state) => state.addItem);
  const updateQuantity = useCart((state) => state.updateQuantity);
  const items = useCart((state) => state.items);
  const openCartSheet = useCartSheet((state) => state.open);
  const { markCartTouched } = useCartPreview();
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);

  const reorderable = getReorderableItems(orderItems);
  if (reorderable.length === 0) return null;

  const skipped = orderItems.length - reorderable.length;

  const reorder = () => {
    setIsAdding(true);
    let added = 0;
    let limited = 0;
    let lastAdded: Product | null = null;

    for (const { product, quantity } of reorderable) {
      const inCart = items.find((item) => item.id === product.id);
      const result = inCart
        ? updateQuantity(
            product.id,
            Math.min(product.stock, (inCart.quantity ?? 1) + quantity),
          )
        : addItem(product, Math.min(product.stock, quantity));
      if (result.ok) {
        added += 1;
        lastAdded = result.item;
        if (Math.min(product.stock, quantity) < quantity) limited += 1;
      }
    }

    setIsAdding(false);

    if (added === 0) {
      toast({
        description: "Estos productos ya no están disponibles.",
        variant: "warning",
      });
      return;
    }

    trackCustomerEvent("add_to_cart", {
      currency: "COP",
      source: "order_reorder",
      items: reorderable.map(({ product, quantity }) => ({
        item_id: product.id,
        item_name: product.name,
        quantity,
        price: Number(product.price),
      })),
    });
    markCartTouched();

    const notes: string[] = [];
    if (skipped > 0) {
      notes.push(
        skipped === 1
          ? "Un producto ya no está disponible y no se agregó."
          : `${skipped} productos ya no están disponibles y no se agregaron.`,
      );
    }
    if (limited > 0) {
      notes.push("Ajustamos alguna cantidad al stock disponible.");
    }

    toast({
      title:
        added === 1
          ? "Producto agregado al carrito"
          : `${added} productos agregados al carrito`,
      description:
        notes.length > 0
          ? notes.join(" ")
          : "Los precios son los de hoy; revísalos antes de pagar.",
      variant: "success",
    });
    openCartSheet(lastAdded?.id);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={reorder}
      disabled={isAdding}
      className={cn(
        "gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees print:hidden",
        className,
      )}
    >
      <RotateCcw aria-hidden="true" className="h-4 w-4" />
      Volver a pedir
    </Button>
  );
}
