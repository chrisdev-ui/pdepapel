import { calculateOrderTotals } from "@/lib/order-totals";
import { DiscountType } from "@prisma/client";
import { describe, expect, it } from "vitest";

describe("calculateOrderTotals", () => {
  const items = [
    { product: { price: 10000 }, quantity: 2 },
    { product: { price: 5000 }, quantity: 1 },
  ];

  it("applies admin discounts, coupons, and shipping in the correct order", () => {
    expect(
      calculateOrderTotals(items, {
        discount: { type: DiscountType.PERCENTAGE, amount: 10 },
        coupon: { type: DiscountType.FIXED, amount: 5000 },
        shippingCost: 8000,
      }),
    ).toEqual({
      subtotal: 25000,
      discount: 2500,
      couponDiscount: 5000,
      total: 25500,
    });
  });

  it("caps fixed discounts and never produces a negative total", () => {
    expect(
      calculateOrderTotals([{ product: { price: 5000 }, quantity: 1 }], {
        discount: { type: DiscountType.FIXED, amount: 8000 },
        coupon: { type: DiscountType.FIXED, amount: 5000 },
      }),
    ).toEqual({
      subtotal: 5000,
      discount: 5000,
      couponDiscount: 0,
      total: 0,
    });
  });

  it("rounds Colombian checkout totals to two decimal places", () => {
    expect(
      calculateOrderTotals([{ product: { price: 3333.33 }, quantity: 3 }], {
        coupon: { type: DiscountType.PERCENTAGE, amount: 10 },
      }),
    ).toEqual({
      subtotal: 9999.99,
      discount: 0,
      couponDiscount: 1000,
      total: 8999.99,
    });
  });
});
