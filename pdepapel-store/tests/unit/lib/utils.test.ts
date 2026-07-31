import { calculateTotals } from "@/lib/utils";
import { describe, expect, it } from "vitest";

describe("calculateTotals", () => {
  it("combines product offers, coupon discounts, and shipping", () => {
    const totals = calculateTotals(
      [
        {
          price: 10000,
          quantity: 2,
          hasDiscount: true,
          originalPrice: 15000,
        },
        { price: 5000, quantity: 1 },
      ] as any,
      {
        isActive: true,
        type: "PERCENTAGE",
        amount: 10,
        minOrderValue: 20000,
      } as any,
      8000,
    );

    expect(totals).toEqual({
      subtotal: 25000,
      productSavings: 10000,
      couponDiscount: 2500,
      total: 30500,
    });
  });

  it("does not apply inactive or ineligible coupons", () => {
    expect(
      calculateTotals(
        [{ price: 12000, quantity: 1 }] as any,
        {
          isActive: true,
          type: "PERCENTAGE",
          amount: 20,
          minOrderValue: 15000,
        } as any,
      ),
    ).toMatchObject({ couponDiscount: 0, total: 12000 });

    expect(
      calculateTotals(
        [{ price: 12000, quantity: 1 }] as any,
        { isActive: false, type: "FIXED", amount: 5000 } as any,
      ),
    ).toMatchObject({ couponDiscount: 0, total: 12000 });
  });

  it("caps fixed discounts at the order subtotal", () => {
    expect(
      calculateTotals(
        [{ price: 5000, quantity: 1 }] as any,
        { isActive: true, type: "FIXED", amount: 8000 } as any,
      ),
    ).toEqual({
      subtotal: 5000,
      productSavings: 0,
      couponDiscount: 5000,
      total: 0,
    });
  });
});
