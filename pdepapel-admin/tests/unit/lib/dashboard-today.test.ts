import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  const resolved = <T,>(value: T) => vi.fn().mockResolvedValue(value);
  return {
    order: { findMany: resolved([]), count: resolved(0) },
    marketplaceOrder: { findMany: resolved([]) },
    marketplaceQuestion: { findMany: resolved([]) },
    orderItem: { findMany: resolved([]), groupBy: resolved([]) },
    orderInventoryIssue: { count: resolved(0) },
    product: { findMany: resolved([]), count: resolved(0) },
    store: { findUnique: resolved(null as { lowStockThreshold: number | null } | null) },
    restockOrderItem: { findMany: resolved([]) },
    marketplaceOrderItem: { groupBy: resolved([]) },
  };
});

vi.mock("@/lib/prismadb", () => ({ default: db }));

import { CAPSULAS_SORPRESA_ID } from "@/constants";
import { buildTodaySummary, channelForOrderType, getColombiaDayBounds, getTodaySummary, paidWithin, type TodayRawInput } from "@/lib/dashboard-today";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "@/lib/product-readiness";
import { OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

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
    expect(summary.lowStock).toEqual({ count: 12, outOfStock: 4, runsOutThisWeek: 0, outOfStockSelling: 0, threshold: DEFAULT_LOW_STOCK_THRESHOLD, thresholdFromSettings: false });
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

  it("puts unreconciled inventory first and points at Movimientos when the orders are gone", () => {
    const withOrders = buildTodaySummary({ ...base(), inventoryIssues: { open: 2, orphans: 0 } }, "store");
    expect(withOrders.pending[0]).toMatchObject({ kind: "inventory-issue", title: "2 líneas de inventario sin cuadrar", href: "/store/pedidos?vista=por-atender", action: "Cuadrar" });

    const orphans = buildTodaySummary({ ...base(), inventoryIssues: { open: 1, orphans: 1 } }, "store");
    expect(orphans.pending[0]).toMatchObject({ kind: "inventory-issue", title: "1 línea de inventario sin cuadrar", href: "/store/movimientos-inventario#incidencias-inventario" });

    const none = buildTodaySummary({ ...base(), inventoryIssues: { open: 0, orphans: 0 } }, "store");
    expect(none.pending.some((item) => item.kind === "inventory-issue")).toBe(false);
  });

  it("surfaces shipping issues on Inicio with the first case named", () => {
    const summary = buildTodaySummary(
      { ...base(), shippingIssues: { count: 2, sample: [{ orderNumber: "ORD-9", fullName: "Sofía Mesa", status: ShippingStatus.InTransit, stale: true }] } },
      "store",
    );
    const item = summary.pending.find((entry) => entry.kind === "shipping-issue");
    expect(item).toMatchObject({ title: "2 envíos con novedad", href: "/store/pedidos?vista=con-novedad", action: "Revisar" });
    expect(item?.meta).toContain("ORD-9 · Sofía Mesa: en tránsito sin novedades hace días y más");
    const kinds = summary.pending.map((entry) => entry.kind);
    expect(kinds.indexOf("shipping-issue")).toBeGreaterThan(kinds.indexOf("verify-payment"));
    expect(kinds.indexOf("shipping-issue")).toBeLessThan(kinds.indexOf("create-guide"));
  });

  describe("replenishment loader", () => {
    beforeEach(() => {
      db.product.findMany.mockReset().mockResolvedValue([]);
      db.product.count.mockReset().mockResolvedValue(0);
      db.store.findUnique.mockResolvedValue(null);
      db.orderItem.groupBy.mockReset().mockResolvedValue([]);
      db.marketplaceOrderItem.groupBy.mockReset().mockResolvedValue([]);
      db.restockOrderItem.findMany.mockReset().mockResolvedValue([]);
    });

    it("ranks by sales cover, excludes kits by flag and cápsulas by category, and keeps the store threshold as a fallback", async () => {
      db.store.findUnique.mockResolvedValue({ lowStockThreshold: 8 });
      db.product.findMany.mockImplementation(async ({ where }: { where: { isKit?: boolean } }) =>
        where.isKit === false
          ? [
              { id: "p1", name: "Regla", stock: 2 },
              { id: "p2", name: "Cuaderno", stock: 6 },
              { id: "p3", name: "Tijeras", stock: 30 },
              { id: "p4", name: "Agenda", stock: 0 },
            ]
          : [],
      );
      // Ventana de 30 días y de 90 días: la misma consulta responde según la fecha.
      // El filtro acepta `paidAt` o, si falta, la fecha de creación: la ventana está en la primera rama.
      db.orderItem.groupBy.mockImplementation(async ({ where }: { where: { order: { OR: [{ paidAt: { gte: Date } }, { paidAt: null; createdAt: { gte: Date } }] } } }) => {
        expect(where.order.OR[1]).toEqual({ paidAt: null, createdAt: { gte: where.order.OR[0].paidAt.gte } });
        const days = Math.round((now.getTime() - where.order.OR[0].paidAt.gte.getTime()) / 86400000);
        return days <= 30
          ? [{ productId: "p1", _sum: { quantity: 1 } }, { productId: "p2", _sum: { quantity: 20 } }]
          : [{ productId: "p1", _sum: { quantity: 2 } }, { productId: "p2", _sum: { quantity: 40 } }, { productId: "p4", _sum: { quantity: 5 } }];
      });

      const summary = await getTodaySummary("s1", now);

      expect(db.store.findUnique).toHaveBeenCalledWith({ where: { id: "s1" }, select: { lowStockThreshold: true } });
      expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { storeId: "s1", isArchived: false, isKit: false, categoryId: { not: CAPSULAS_SORPRESA_ID } } }));
      // Nunca por id de categoría de kits: un kit se reconoce por `isKit`.
      const wheres = db.product.findMany.mock.calls.map((call) => JSON.stringify(call[0]));
      expect(wheres.every((where) => !where.includes("notIn"))).toBe(true);
      // p2 vende 20 en 30 días con 6 en stock (9 días de cobertura); p1 vende poco pero está bajo el umbral;
      // p4 está agotada y vendió en 90 días (no en 30: no cuenta como «se acaba esta semana»); p3 no entra.
      expect(summary.lowStock).toEqual({ count: 3, outOfStock: 1, runsOutThisWeek: 0, outOfStockSelling: 1, threshold: 8, thresholdFromSettings: true });
      const restock = summary.pending.filter((item) => item.kind === "restock");
      expect(restock[0]).toMatchObject({ title: "Reponer · Agenda", meta: "Agotado" });
      expect(restock[1]).toMatchObject({ title: "Reponer · Cuaderno", meta: "9 días" });
    });

    it("falls back to the default threshold when the store has none", async () => {
      const summary = await getTodaySummary("s1", now);
      expect(summary.lowStock).toMatchObject({ count: 0, threshold: DEFAULT_LOW_STOCK_THRESHOLD, thresholdFromSettings: false });
    });
  });
});
