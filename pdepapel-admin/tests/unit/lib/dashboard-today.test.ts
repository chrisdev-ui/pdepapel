import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { buildTodaySummary, channelForOrderType, getColombiaDayBounds, paidWithin, type TodayRawInput } from "@/lib/dashboard-today";
import { OrderType, PaymentMethod } from "@prisma/client";

const now = new Date("2026-09-07T21:52:00.000Z"); // 16:52 en Colombia

const base = (): TodayRawInput => ({
  now,
  todayOrders: [{ total: 39000 }],
  todayMarketplaceNet: 131200,
  pendingTransfers: [
    { id: "o1", orderNumber: "ORD-1", fullName: "Mariana Torres", total: 39000, createdAt: new Date("2026-09-07T19:52:00.000Z"), method: PaymentMethod.BankTransfer },
    { id: "o2", orderNumber: "ORD-2", fullName: "Laura Gómez", total: 38000, createdAt: new Date("2026-09-07T15:52:00.000Z"), method: PaymentMethod.BankTransfer },
  ],
  awaitingPayments: [
    { id: "o5", orderNumber: "ORD-5", fullName: "Camila Ruiz", total: 54000, createdAt: new Date("2026-09-07T17:30:00.000Z"), method: PaymentMethod.Bold },
  ],
  toDispatch: [{ id: "o3", orderNumber: "ORD-3", fullName: "Andrés Pérez", city: "Bogotá", paidAt: new Date("2026-09-06T20:00:00.000Z"), courier: "Coordinadora" }],
  toDispatchCount: 3,
  lowStockProducts: [{ id: "p1", name: "Regla Kawaii", stock: 1 }],
  lowStockCount: 12,
  outOfStockCount: 4,
  unansweredQuestions: [{ id: "q1", question: "¿Tienen en azul?", productName: "Cuaderno Snoopy", askedAt: new Date("2026-09-07T21:12:00.000Z") }],
  unansweredCount: 1,
  expiringQuotes: [],
  weekOrders: [
    { total: 39000, paidAt: new Date("2026-09-07T20:00:00.000Z"), createdAt: now, type: OrderType.STANDARD },
    { total: 62000, paidAt: new Date("2026-09-05T15:00:00.000Z"), createdAt: now, type: OrderType.POINT_OF_SALE },
    { total: 10000, paidAt: new Date("2026-09-01T04:30:00.000Z"), createdAt: now, type: OrderType.FESTIVAL }, // 31 ago 23:30 en Colombia: fuera de la semana
  ],
  previousWeekOrders: [{ total: 100000 }],
  weekMarketplace: [{ netAmount: 131200, paidAt: new Date("2026-09-07T13:15:00.000Z"), createdAt: now }],
  previousWeekMarketplaceNet: 0,
  weekItems: [
    { productId: "p9", name: "Cuaderno Snoopy", quantity: 3 },
    { productId: "p9", name: "Cuaderno Snoopy", quantity: 11 },
    { productId: "p8", name: "Sticker pack", quantity: 8 },
    { productId: null, name: "Ítem manual", quantity: 1 },
  ],
});

describe("dashboard today", () => {
  it("bounds the day in Colombia time", () => {
    const { start, end } = getColombiaDayBounds(now);
    expect(start.toISOString()).toBe("2026-09-07T05:00:00.000Z");
    expect(end.toISOString()).toBe("2026-09-08T04:59:59.999Z");
  });

  it("accepts orders marked paid before paidAt existed by their creation date", () => {
    const start = new Date("2026-09-01T05:00:00.000Z");
    const end = new Date("2026-09-08T04:59:59.999Z");
    expect(paidWithin(start, end)).toEqual({
      OR: [
        { paidAt: { gte: start, lte: end } },
        { paidAt: null, createdAt: { gte: start, lte: end } },
      ],
    });
  });

  it("maps order types to channels", () => {
    expect(channelForOrderType(OrderType.STANDARD)).toBe("tienda");
    expect(channelForOrderType(OrderType.QUOTATION)).toBe("tienda");
    expect(channelForOrderType(OrderType.POINT_OF_SALE)).toBe("presencial");
    expect(channelForOrderType(OrderType.FESTIVAL)).toBe("feria");
  });

  it("adds net store sales and net marketplace sales for today", () => {
    const summary = buildTodaySummary(base(), "s1");
    expect(summary.today).toEqual({ net: 170200, orders: 1, marketplaceNet: 131200 });
    expect(summary.pendingPayments).toEqual({ count: 2, amount: 77000 });
    expect(summary.toDispatch).toBe(3);
    expect(summary.lowStock).toEqual({ count: 12, outOfStock: 4 });
  });

  it("orders pending actions by urgency with links to the record", () => {
    const summary = buildTodaySummary(base(), "s1");
    expect(summary.pending.map((p) => p.kind)).toEqual(["verify-payment", "verify-payment", "awaiting-payment", "create-guide", "answer-question", "restock"]);
    expect(summary.pending[0]).toMatchObject({ title: "Verificar transferencia · ORD-1", href: "/s1/pedidos/o1", action: "Verificar pago" });
    expect(summary.pending[0].meta).toContain("hace 2 h");
    expect(summary.pending[2]).toMatchObject({ title: "Pago en línea sin completar · ORD-5", href: "/s1/pedidos/o5#pago", action: "Reenviar enlace" });
    expect(summary.pending[2].meta).toContain("Bold");
    expect(summary.pending[2].meta).toContain("hace 4 h");
    expect(summary.pending[3].meta).toContain("Bogotá");
    expect(summary.pending[5]).toMatchObject({ href: "/s1/productos/p1", meta: "1 unidad" });
  });

  it("keeps working when the loader sends no stale online payments", () => {
    const summary = buildTodaySummary({ ...base(), awaitingPayments: undefined }, "s1");
    expect(summary.pending.some((p) => p.kind === "awaiting-payment")).toBe(false);
  });

  it("builds the week by Colombia days, compares with the previous week, and splits channels", () => {
    const summary = buildTodaySummary(base(), "s1");
    expect(summary.week.days).toHaveLength(7);
    expect(summary.week.days.map((d) => d.label)).toEqual(["M", "X", "J", "V", "S", "D", "L"]);
    expect(summary.week.days[6]).toMatchObject({ date: "2026-09-07", net: 170200 });
    expect(summary.week.days[4]).toMatchObject({ date: "2026-09-05", net: 62000 });
    // The 31 Aug 23:30 Colombia sale is outside the 7-day window but still counted in the raw total? No: rows are filtered by the loader; the builder only buckets what it receives.
    expect(summary.week.net).toBe(39000 + 62000 + 10000 + 131200);
    expect(summary.week.change).toBe(142);
    expect(summary.week.channels.map((c) => [c.channel, c.net])).toEqual([["tienda", 39000], ["mercadolibre", 131200], ["presencial", 62000], ["feria", 10000]]);
  });

  it("ranks the top products by units across items", () => {
    const summary = buildTodaySummary(base(), "s1");
    expect(summary.topProducts).toEqual([
      { productId: "p9", name: "Cuaderno Snoopy", units: 14 },
      { productId: "p8", name: "Sticker pack", units: 8 },
      { productId: null, name: "Ítem manual", units: 1 },
    ]);
  });
});
