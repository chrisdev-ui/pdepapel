import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  countPaidOrders: vi.fn(),
  findRedemption: vi.fn(),
  createRedemption: vi.fn(),
  updateRedemption: vi.fn(),
  updateManyRedemptions: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({
  clerkClient: { users: { getUser: mocks.getUser } },
}));

import {
  assertWelcomeBenefitEligibility,
  getWelcomeBenefitFilter,
  markWelcomeBenefitRedeemed,
  releaseWelcomeBenefitReservation,
  reserveWelcomeBenefit,
} from "@/lib/customer-benefits";
import type {
  WelcomeBenefitDatabase,
  WelcomeBenefitEligibilityDatabase,
} from "@/lib/customer-benefits";
import { Coupon, CouponRedemptionStatus } from "@prisma/client";

const welcomeCoupon = {
  id: "coupon-id",
  storeId: "store-id",
  code: "HOLA10",
  isWelcomeBenefit: true,
} as Coupon;

const standardCoupon = {
  ...welcomeCoupon,
  isWelcomeBenefit: false,
} as Coupon;

// Only the delegate methods these functions actually call are stubbed, so the
// mock is cast to the narrow database contracts the module exports.
const database = {
  order: { count: mocks.countPaidOrders },
  couponRedemption: {
    findUnique: mocks.findRedemption,
    create: mocks.createRedemption,
    update: mocks.updateRedemption,
    updateMany: mocks.updateManyRedemptions,
  },
} as unknown as WelcomeBenefitDatabase & WelcomeBenefitEligibilityDatabase;

describe("customer account benefits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      primaryEmailAddressId: "email-id",
      emailAddresses: [
        {
          id: "email-id",
          emailAddress: "compras@ejemplo.com",
          verification: { status: "verified" },
        },
      ],
    });
    mocks.countPaidOrders.mockResolvedValue(0);
    mocks.findRedemption.mockResolvedValue(null);
    mocks.createRedemption.mockResolvedValue({ id: "redemption-id" });
    mocks.updateManyRedemptions.mockResolvedValue({ count: 1 });
  });

  it("filters only active welcome benefits within their configured dates", () => {
    expect(getWelcomeBenefitFilter("store-id", new Date("2026-08-20"))).toEqual({
      storeId: "store-id",
      isWelcomeBenefit: true,
      isActive: true,
      startDate: { lte: new Date("2026-08-20") },
      endDate: { gte: new Date("2026-08-20") },
    });
  });

  it("does not add account checks to ordinary coupons", async () => {
    await expect(
      assertWelcomeBenefitEligibility({
        coupon: standardCoupon,
        storeId: "store-id",
        userId: null,
        database,
      }),
    ).resolves.toBeNull();

    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.countPaidOrders).not.toHaveBeenCalled();
  });

  it("requires the verified account email and an unused first purchase", async () => {
    await expect(
      assertWelcomeBenefitEligibility({
        coupon: welcomeCoupon,
        storeId: "store-id",
        userId: "customer-id",
        checkoutEmail: "COMPRAS@EJEMPLO.COM",
        database,
      }),
    ).resolves.toBe("compras@ejemplo.com");

    expect(mocks.countPaidOrders).toHaveBeenCalledWith({
      where: expect.objectContaining({ userId: "customer-id", storeId: "store-id" }),
    });
  });

  it("rejects a benefit that is already reserved or redeemed", async () => {
    mocks.findRedemption.mockResolvedValueOnce({
      status: CouponRedemptionStatus.RESERVED,
    });

    await expect(
      assertWelcomeBenefitEligibility({
        coupon: welcomeCoupon,
        storeId: "store-id",
        userId: "customer-id",
        database,
      }),
    ).rejects.toThrow("reservado");

    mocks.findRedemption.mockResolvedValueOnce({
      status: CouponRedemptionStatus.REDEEMED,
    });

    await expect(
      assertWelcomeBenefitEligibility({
        coupon: welcomeCoupon,
        storeId: "store-id",
        userId: "customer-id",
        database,
      }),
    ).rejects.toThrow("ya fue usado");
  });

  it("reserves, redeems, and releases only the matching customer order", async () => {
    await reserveWelcomeBenefit(database, {
      couponId: "coupon-id",
      storeId: "store-id",
      userId: "customer-id",
      orderId: "order-id",
    });

    expect(mocks.createRedemption).toHaveBeenCalledWith({
      data: expect.objectContaining({
        couponId: "coupon-id",
        userId: "customer-id",
        orderId: "order-id",
        status: CouponRedemptionStatus.RESERVED,
      }),
    });

    await markWelcomeBenefitRedeemed(database, {
      couponId: "coupon-id",
      userId: "customer-id",
      orderId: "order-id",
    });
    await releaseWelcomeBenefitReservation(database, {
      couponId: "coupon-id",
      userId: "customer-id",
      orderId: "order-id",
    });

    expect(mocks.updateManyRedemptions).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ orderId: "order-id" }),
        data: expect.objectContaining({ status: CouponRedemptionStatus.REDEEMED }),
      }),
    );
    expect(mocks.updateManyRedemptions).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ orderId: "order-id" }),
        data: expect.objectContaining({ status: CouponRedemptionStatus.RELEASED }),
      }),
    );
  });
});
