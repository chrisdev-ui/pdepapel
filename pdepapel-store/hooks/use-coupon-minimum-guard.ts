import { useEffect, useRef } from "react";

import type { Coupon } from "@/types";

/**
 * Quita el cupón aplicado en cuanto el carrito baja de su compra mínima, en
 * vez de dejarlo «aplicado» con $ 0 de descuento hasta que el checkout lo
 * rechace. Avisa una sola vez por cupón.
 */
export function useCouponMinimumGuard(
  coupon: Coupon | null | undefined,
  subtotal: number,
  onRemove: (coupon: Coupon) => void,
) {
  const removedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!coupon) {
      removedRef.current = null;
      return;
    }
    const minimum = Number(coupon.minOrderValue ?? 0);
    if (minimum <= 0 || subtotal >= minimum || removedRef.current === coupon.id) return;
    removedRef.current = coupon.id;
    onRemove(coupon);
  }, [coupon, subtotal, onRemove]);
}
