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
