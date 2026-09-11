import { describe, expect, it, vi } from "vitest";

import { activeCouponWhere, assertCouponHasUses, getCouponDetail, getCouponUsage } from "@/lib/coupon-availability";

const coupon = { id: "c1", code: "VUELVE10", maxUses: 3, usedCount: 1 };

function db(reserved: number) {
  return {
    coupon: { fields: { maxUses: "maxUses-ref" }, findFirst: vi.fn() },
    order: { count: vi.fn().mockResolvedValue(reserved), findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as Parameters<typeof getCouponUsage>[0] & Parameters<typeof activeCouponWhere>[0];
}

describe("coupon availability", () => {
  it("counts pending unpaid orders as reservations", async () => {
    const database = db(1);
    await expect(getCouponUsage(database, coupon)).resolves.toEqual({ used: 1, reserved: 1, limit: 3, remaining: 1, exhausted: false });
    expect(database.order.count).toHaveBeenCalledWith({
      where: { couponId: "c1", status: { in: ["CREATED", "PENDING"] }, paidAt: null },
    });
  });

  it("treats an unlimited coupon as never exhausted", async () => {
    await expect(getCouponUsage(db(40), { ...coupon, maxUses: null })).resolves.toMatchObject({ limit: null, remaining: null, exhausted: false });
  });

  it("refuses the coupon once paid plus reserved uses reach the limit", async () => {
    await expect(assertCouponHasUses(db(2), coupon)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("reservados por pedidos pendientes"),
    });
    await expect(assertCouponHasUses(db(0), { ...coupon, usedCount: 3 })).rejects.toMatchObject({
      message: "El cupón VUELVE10 ya alcanzó su máximo de usos.",
    });
  });

  it("ignores the order being edited when it holds the reservation", async () => {
    const database = db(0);
    await assertCouponHasUses(database, coupon, { excludeOrderId: "o9" });
    expect(database.order.count).toHaveBeenCalledWith({
      where: { couponId: "c1", status: { in: ["CREATED", "PENDING"] }, paidAt: null, id: { not: "o9" } },
    });
  });

  it("builds the active-coupon filter with a normalized code and the real window", () => {
    const now = new Date("2026-09-11T15:00:00Z");
    expect(activeCouponWhere(db(0), "s1", "  vuelve10 ", now)).toEqual({
      storeId: "s1",
      code: "VUELVE10",
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      OR: [{ maxUses: null }, { AND: [{ maxUses: { not: null } }, { usedCount: { lt: "maxUses-ref" } }] }],
    });
  });

  it("returns the detail with usage, order count and recent orders scoped to the store", async () => {
    const database = db(0);
    (database.coupon.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ ...coupon, storeId: "s1" });
    (database.order.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0).mockResolvedValueOnce(4);
    const detail = await getCouponDetail(database, "s1", "c1");
    expect(database.coupon.findFirst).toHaveBeenCalledWith({ where: { id: "c1", storeId: "s1" } });
    expect(detail).toMatchObject({ id: "c1", usage: { used: 1, reserved: 0 }, ordersCount: 4, recentOrders: [] });
    expect(database.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { couponId: "c1" }, take: 5 }));
    (database.coupon.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(getCouponDetail(database, "other", "c1")).resolves.toBeNull();
  });
});
