import { PaymentMethod } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prismadb", () => ({ default: { order: { findMany } } }));

import {
  buildPointOfSaleDaySummary,
  formatPointOfSaleDay,
  getPointOfSaleDaySummaryFor,
  methodForPayment,
  resolvePointOfSaleDay,
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

describe("días anteriores del punto de venta", () => {
  const NOW = new Date("2026-10-09T20:00:00.000Z"); // 3 p. m. en Colombia

  it("sin fecha muestra ayer; nunca un día futuro; una fecha inválida vuelve a ayer", () => {
    expect(resolvePointOfSaleDay(undefined, NOW)).toEqual({ day: "2026-10-08", isToday: false, previous: "2026-10-07", next: "2026-10-09" });
    expect(resolvePointOfSaleDay("2026-10-05", NOW)).toEqual({ day: "2026-10-05", isToday: false, previous: "2026-10-04", next: "2026-10-06" });
    expect(resolvePointOfSaleDay("2099-01-01", NOW)).toEqual({ day: "2026-10-09", isToday: true, previous: "2026-10-08", next: null });
    expect(resolvePointOfSaleDay("ayer", NOW).day).toBe("2026-10-08");
  });

  it("nombra el día en español", () => {
    expect(formatPointOfSaleDay("2026-10-08")).toBe("jueves 8 de octubre de 2026");
  });

  it("trae todas las ventas pagadas de ese día de Colombia, no solo las últimas", async () => {
    const many = Array.from({ length: RECENT_SALES_LIMIT + 3 }, (_, index) => sale({ id: String(index) }));
    findMany.mockResolvedValueOnce(many);
    const summary = await getPointOfSaleDaySummaryFor("store-1", "2026-10-08");
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      storeId: "store-1",
      type: "POINT_OF_SALE",
      paidAt: { gte: new Date("2026-10-08T05:00:00.000Z"), lte: new Date("2026-10-09T04:59:59.999Z") },
    });
    expect(summary.sales).toBe(RECENT_SALES_LIMIT + 3);
    expect(summary.all).toHaveLength(RECENT_SALES_LIMIT + 3);
    expect(summary.recent).toHaveLength(RECENT_SALES_LIMIT);
  });
});
