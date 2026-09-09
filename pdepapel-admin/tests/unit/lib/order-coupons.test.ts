import {
  assertCouponMinimumOrderValue,
  resolveCouponForOrderUpdate,
} from "@/lib/order-coupons";
import { Coupon, DiscountType } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const existingCoupon = {
  id: "coupon-existing",
  storeId: "store-1",
  code: "ANTERIOR10",
  type: DiscountType.PERCENTAGE,
  amount: 10,
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-12-31T23:59:59.999Z"),
  maxUses: 99,
  usedCount: 3,
  isActive: true,
  minOrderValue: 0,
  isWelcomeBenefit: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} satisfies Coupon;

function couponDatabase(result: Coupon | null) {
  return {
    coupon: {
      findFirst: vi.fn().mockResolvedValue(result),
      fields: { maxUses: "maxUses-field-reference" },
    },
  } as unknown as NonNullable<
    Parameters<typeof resolveCouponForOrderUpdate>[0]["database"]
  >;
}

describe("order coupon updates", () => {
  it("preserves the attached coupon when old clients omit couponCode", async () => {
    const database = couponDatabase(null);

    await expect(
      resolveCouponForOrderUpdate({
        storeId: "store-1",
        couponCode: undefined,
        couponCodeProvided: false,
        existingCoupon,
        database,
      }),
    ).resolves.toBe(existingCoupon);
    expect(database.coupon.findFirst).not.toHaveBeenCalled();
  });

  it("keeps the same attached coupon without revalidating its current dates", async () => {
    const database = couponDatabase(null);

    await expect(
      resolveCouponForOrderUpdate({
        storeId: "store-1",
        couponCode: " anterior10 ",
        couponCodeProvided: true,
        existingCoupon,
        database,
      }),
    ).resolves.toBe(existingCoupon);
    expect(database.coupon.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when the admin explicitly removes the coupon", async () => {
    await expect(
      resolveCouponForOrderUpdate({
        storeId: "store-1",
        couponCode: "",
        couponCodeProvided: true,
        existingCoupon,
        database: couponDatabase(null),
      }),
    ).resolves.toBeNull();
  });

  it("resolves a newly selected coupon with normalized code and server rules", async () => {
    const selectedCoupon = {
      ...existingCoupon,
      id: "coupon-solaris",
      code: "SOLARIS10",
    };
    const database = couponDatabase(selectedCoupon);
    const now = new Date("2026-09-09T12:00:00.000Z");

    await expect(
      resolveCouponForOrderUpdate({
        storeId: "store-1",
        couponCode: " solaris10 ",
        couponCodeProvided: true,
        existingCoupon,
        database,
        now,
      }),
    ).resolves.toEqual(selectedCoupon);
    expect(database.coupon.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        storeId: "store-1",
        code: "SOLARIS10",
        isActive: true,
        startDate: { lte: now },
        endDate: { gte: now },
      }),
    });
  });

  it("rejects a code that cannot be resolved", async () => {
    await expect(
      resolveCouponForOrderUpdate({
        storeId: "store-1",
        couponCode: "NO-EXISTE",
        couponCodeProvided: true,
        existingCoupon: null,
        database: couponDatabase(null),
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      message: "Código de cupón no válido o expirado",
    });
  });

  it("validates the minimum against the authoritative product subtotal", () => {
    const coupon = { ...existingCoupon, minOrderValue: 50_000 };

    expect(() => assertCouponMinimumOrderValue(coupon, 49_999)).toThrow(
      "El pedido debe ser mayor a",
    );
    expect(() => assertCouponMinimumOrderValue(coupon, 50_000)).not.toThrow();
  });
});
