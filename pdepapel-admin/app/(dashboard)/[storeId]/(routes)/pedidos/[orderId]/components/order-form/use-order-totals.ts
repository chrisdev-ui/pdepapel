import { calculateOrderTotals, getShippingChargeState, type OrderTotals } from "@/lib/order-totals";
import type { Coupon, DiscountType } from "@prisma/client";
import { useMemo } from "react";
import { useWatch, type Control } from "react-hook-form";

import type { OrderFormValues } from "./schema";

/**
 * Totales del formulario con la misma aritmética que la API
 * (`lib/order-totals`), redondeo incluido, para que lo que ve la
 * administradora sea lo que se guarda.
 */
export function useOrderTotals(control: Control<OrderFormValues>, coupon: Coupon | null, freeShippingThreshold: number | null) {
  const items = useWatch({ control, name: "orderItems" });
  const discountType = useWatch({ control, name: "discount.type" });
  const discountAmount = useWatch({ control, name: "discount.amount" });
  const shippingCost = useWatch({ control, name: "shipping.cost" });
  const rateId = useWatch({ control, name: "envioClickIdRate" });

  const totals: OrderTotals = useMemo(() => {
    const lines = (items ?? []).map((item) => ({
      product: {
        price: item.discountedPrice !== undefined && item.discountedPrice !== null ? Number(item.discountedPrice) : Number(item.price),
      },
      quantity: Number(item.quantity) || 0,
    }));
    const subtotal = lines.reduce((sum, line) => sum + line.product.price * line.quantity, 0);
    const couponApplies = coupon && subtotal >= (Number(coupon.minOrderValue) || 0);
    return calculateOrderTotals(lines, {
      discount: discountType && discountAmount && !isNaN(Number(discountAmount)) ? { type: discountType as DiscountType, amount: Number(discountAmount) } : undefined,
      coupon: couponApplies ? { type: coupon.type as DiscountType, amount: Number(coupon.amount) } : undefined,
      shippingCost: Number(shippingCost) || 0,
    });
  }, [items, discountType, discountAmount, coupon, shippingCost]);

  const shippingChargeState = useMemo(
    () =>
      getShippingChargeState({
        shippingCost: Number(shippingCost) || 0,
        subtotal: totals.subtotal,
        freeShippingThreshold,
        hasQuote: Boolean(rateId),
      }),
    [shippingCost, totals.subtotal, freeShippingThreshold, rateId],
  );

  return { totals, shippingChargeState, shippingCost: Number(shippingCost) || 0 };
}
