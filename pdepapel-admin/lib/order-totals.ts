import { DiscountType } from "@prisma/client";

/** Round monetary values to two decimals to avoid floating-point artifacts. */
export const round2 = (value: number) => Math.round(value * 100) / 100;

export interface OrderTotals {
  subtotal: number;
  discount: number;
  couponDiscount: number;
  total: number;
}

export interface DiscountConfig {
  type: DiscountType;
  amount: number;
}

export function calculateOrderTotals(
  orderItems: Array<{
    product: { price: number };
    quantity: number;
  }>,
  config?: {
    discount?: DiscountConfig;
    coupon?: DiscountConfig;
    shippingCost?: number;
  },
): OrderTotals {
  const subtotal = orderItems.reduce(
    (sum, item) => sum + Number(item.product.price) * item.quantity,
    0,
  );

  let discount = 0;
  if (config?.discount) {
    discount =
      config.discount.type === DiscountType.PERCENTAGE
        ? (subtotal * config.discount.amount) / 100
        : Math.min(config.discount.amount, subtotal);
  }

  let couponDiscount = 0;
  if (config?.coupon) {
    const afterDiscount = subtotal - discount;
    couponDiscount =
      config.coupon.type === DiscountType.PERCENTAGE
        ? (afterDiscount * config.coupon.amount) / 100
        : Math.min(config.coupon.amount, afterDiscount);
  }

  const total = Math.max(
    0,
    subtotal - discount - couponDiscount + (config?.shippingCost || 0),
  );

  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    couponDiscount: round2(couponDiscount),
    total: round2(total),
  };
}

/**
 * Free shipping rule shared by the storefront summary and the checkout
 * validation: the product subtotal (after product-level discounts, before
 * coupons and shipping) must reach the store threshold. `null`/`0` disables it.
 */
export function qualifiesForFreeShipping(
  subtotal: number,
  threshold: number | null | undefined,
): boolean {
  return (
    typeof threshold === "number" &&
    Number.isFinite(threshold) &&
    threshold > 0 &&
    subtotal >= threshold
  );
}

export function getEffectiveShippingCost(
  subtotal: number,
  shippingCost: number,
  threshold: number | null | undefined,
): { shippingCost: number; freeShipping: boolean } {
  const freeShipping = qualifiesForFreeShipping(subtotal, threshold);
  return { shippingCost: freeShipping ? 0 : shippingCost, freeShipping };
}

export type ShippingChargeState = "charged" | "free" | "pending";

/**
 * Describes how the admin should label an order's shipping line.
 * A positive cost is always charged. A zero cost is "free" when the product
 * subtotal reaches the store threshold or when a carrier quote was saved with
 * no charge (carriers never quote zero, so that only happens through the free
 * shipping rule). Anything else is still pending a quote.
 */
export function getShippingChargeState({
  shippingCost,
  subtotal,
  freeShippingThreshold,
  hasQuote = false,
}: {
  shippingCost: number | null | undefined;
  subtotal: number;
  freeShippingThreshold?: number | null;
  hasQuote?: boolean;
}): ShippingChargeState {
  const cost = Number(shippingCost) || 0;
  if (cost > 0) return "charged";
  if (qualifiesForFreeShipping(subtotal, freeShippingThreshold)) return "free";
  if (hasQuote) return "free";
  return "pending";
}
