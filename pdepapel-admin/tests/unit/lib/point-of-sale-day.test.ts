import { PaymentMethod } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildPointOfSaleDaySummary,
  methodForPayment,
  RECENT_SALES_LIMIT,
  type PointOfSaleDayRawSale,
} from "@/lib/point-of-sale-day";

function sale(overrides: Partial<PointOfSaleDayRawSale> & { id: string }): PointOfSaleDayRawSale {
  return {
    orderNumber: `ORD-${overrides.id}`,
    total: 10000,
    paidAt: new Date("2026-09-07T15:00:00Z"),
    createdAt: new Date("2026-09-07T14:59:00Z"),
    payment: { method: PaymentMethod.CASH },
    orderItems: [{ quantity: 1 }],
    ...overrides,
  };
}

describe("point-of-sale-day", () => {
  it("returns an empty close when nothing was sold", () => {
    const summary = buildPointOfSaleDaySummary([]);
    expect(summary.sales).toBe(0);
    expect(summary.total).toBe(0);
    expect(summary.units).toBe(0);
    expect(summary.lastSaleAt).toBeNull();
    expect(summary.byMethod.cash).toEqual({ count: 0, total: 0 });
    expect(summary.byMethod.transfer).toEqual({ count: 0, total: 0 });
  });

  it("groups totals by payment method and counts units", () => {
    const summary = buildPointOfSaleDaySummary([
      sale({ id: "a", total: 12000, orderItems: [{ quantity: 2 }, { quantity: 1 }] }),
      sale({
        id: "b",
        total: 8000,
        payment: { method: PaymentMethod.BankTransfer },
        paidAt: new Date("2026-09-07T16:30:00Z"),
      }),
      sale({ id: "c", total: 5000, payment: null }),
    ]);

    expect(summary.sales).toBe(3);
    expect(summary.units).toBe(5);
    expect(summary.total).toBe(25000);
    expect(summary.byMethod.cash).toEqual({ count: 1, total: 12000 });
    expect(summary.byMethod.transfer).toEqual({ count: 1, total: 8000 });
    expect(summary.byMethod.other).toEqual({ count: 1, total: 5000 });
    expect(summary.recent[0].orderNumber).toBe("ORD-b");
    expect(summary.lastSaleAt?.toISOString()).toBe("2026-09-07T16:30:00.000Z");
  });

  it("falls back to createdAt when paidAt is missing and caps the recent list", () => {
    const raw = Array.from({ length: RECENT_SALES_LIMIT + 3 }, (_, index) =>
      sale({
        id: String(index),
        paidAt: null,
        createdAt: new Date(2026, 8, 7, 8, index),
      }),
    );
    const summary = buildPointOfSaleDaySummary(raw);
    expect(summary.recent).toHaveLength(RECENT_SALES_LIMIT);
    expect(summary.recent[0].id).toBe(String(RECENT_SALES_LIMIT + 2));
    expect(summary.sales).toBe(RECENT_SALES_LIMIT + 3);
  });

  it("maps Prisma payment methods to the close buckets", () => {
    expect(methodForPayment(PaymentMethod.CASH)).toBe("cash");
    expect(methodForPayment(PaymentMethod.BankTransfer)).toBe("transfer");
    expect(methodForPayment(PaymentMethod.Bold)).toBe("other");
    expect(methodForPayment(null)).toBe("other");
  });
});
