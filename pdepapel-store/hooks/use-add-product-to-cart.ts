import { useCallback } from "react";

import { useCart } from "@/hooks/use-cart";
import { useCartSheet } from "@/hooks/use-cart-sheet";
import { toast } from "@/hooks/use-toast";
import { getAnalyticsValue, toAnalyticsItem, trackCustomerEvent } from "@/lib/customer-analytics";
import { useCartPreview } from "@/providers/cart-preview-provider";
import { Product } from "@/types";

/** Agregar desde la ficha o su barra fija: misma validación, analítica y apertura del carrito. */
export function useAddProductToCart(source: string) {
  const items = useCart((state) => state.items);
  const addItem = useCart((state) => state.addItem);
  const updateQuantity = useCart((state) => state.updateQuantity);
  const { markCartTouched } = useCartPreview();
  const openCartSheet = useCartSheet((state) => state.open);

  return useCallback(
    (product: Product, quantity: number, onAdded?: () => void) => {
      const inCart = items.find((item) => item.id === product.id);
      const requested = Math.max(1, quantity);
      const result = inCart ? updateQuantity(product.id, requested) : addItem(product, requested);

      if (!result.ok) {
        toast({
          description:
            result.status === "stock_limit"
              ? "La cantidad solicitada supera el stock disponible."
              : "Este producto no está disponible en este momento.",
          variant: "warning",
        });
        return false;
      }

      const item = toAnalyticsItem(product, requested);
      trackCustomerEvent("add_to_cart", { currency: "COP", items: [item], source, value: getAnalyticsValue([item]) });
      markCartTouched();
      onAdded?.();
      openCartSheet(result.item.id);
      return true;
    },
    [addItem, items, markCartTouched, openCartSheet, source, updateQuantity],
  );
}
