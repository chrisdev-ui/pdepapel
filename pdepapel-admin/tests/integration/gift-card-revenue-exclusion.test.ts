import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

/**
 * La compra de una tarjeta de regalo NO es ingreso. Con dos pedidos pagados
 * en la misma tienda —una tarjeta de 100.000 y una venta normal de 20.000—
 * cada sitio que suma ingresos, nombrado uno por uno, tiene que ver solo
 * los 20.000. Si alguno ve 120.000, la tarjeta se coló.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: async () => ({ publicMetadata: {} }) } }),
}));

const GIFT = 100000;
const SALE = 20000;
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;

const customer = {
  fullName: "Luisa Sánchez",
  phone: "+573001234567",
  email: "luisa@prueba.test",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  department: "Antioquia",
};

async function seed(f: InventoryFixture) {
  const gift = await testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-GC-${randomUUID().slice(0, 8)}`,
      status: OrderStatus.PAID,
      paidAt: now,
      type: OrderType.GIFT_CARD,
      ...customer,
      subtotal: GIFT,
      total: GIFT,
      netProfit: 0,
      orderItems: { create: [{ productId: null, isCustom: true, quantity: 1, price: GIFT, name: "Tarjeta de regalo" }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.Bold } },
    },
  });
  const sale = await testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-ST-${randomUUID().slice(0, 8)}`,
      status: OrderStatus.PAID,
      paidAt: now,
      type: OrderType.STANDARD,
      ...customer,
      subtotal: SALE,
      total: SALE,
      netProfit: 8000,
      orderItems: { create: [{ productId: f.component.id, quantity: 2, price: 10000, name: "Componente" }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.Bold } },
    },
  });
  return { gift, sale };
}

describe("gift card purchases are excluded from every revenue site", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  beforeEach(async () => {
    const { __resetShortMemo } = await import("@/lib/short-memo");
    __resetShortMemo();
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await seed(fixture);
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("actions/get-total-revenue.ts", async () => {
    const { getTotalRevenue } = await import("@/actions/get-total-revenue");
    expect(await getTotalRevenue(fixture!.store.id, year)).toBe(SALE);
  });

  it("actions/get-sales-count.ts", async () => {
    const { getSalesCount } = await import("@/actions/get-sales-count");
    const counts = await getSalesCount(fixture!.store.id, year);
    expect(counts).toMatchObject({ totalSales: 1, totalNetRevenue: SALE, totalGrossRevenue: SALE });
  });

  it("actions/get-average-order-value.ts", async () => {
    const { getAverageOrderValue } = await import("@/actions/get-average-order-value");
    expect(await getAverageOrderValue(fixture!.store.id, year)).toBe(SALE);
  });

  it("actions/get-graph-revenue.ts", async () => {
    const { getGraphRevenue } = await import("@/actions/get-graph-revenue");
    const months = await getGraphRevenue(fixture!.store.id, year);
    expect(months.reduce((sum, m) => sum + m.total, 0)).toBe(SALE);
  });

  it("actions/get-sales-data.ts", async () => {
    const { getSalesData } = await import("@/actions/get-sales-data");
    const days = await getSalesData(fixture!.store.id, year);
    expect(days.reduce((sum, d) => sum + d.revenue, 0)).toBe(SALE);
    expect(days.reduce((sum, d) => sum + d.orders, 0)).toBe(1);
  });

  it("actions/get-category-sales.ts", async () => {
    const { getCategorySales } = await import("@/actions/get-category-sales");
    const rows = await getCategorySales(fixture!.store.id, year);
    const total = rows.reduce((sum, r) => sum + r.grossSales, 0);
    expect(total).toBe(SALE);
    expect(rows.every((r) => r.grossSales < GIFT)).toBe(true);
  });

  it("actions/get-top-selling-products.ts", async () => {
    const { getTopSellingProducts } = await import("@/actions/get-top-selling-products");
    const rows = await getTopSellingProducts(fixture!.store.id, year);
    expect(rows.find((r) => r.id === fixture!.component.id)?.totalSold).toBe(2);
    expect(rows.some((r) => r.name === "Tarjeta de regalo")).toBe(false);
  });

  it("actions/get-product-profitability.ts", async () => {
    const { getProductProfitRanking } = await import("@/actions/get-product-profitability");
    const rows = await getProductProfitRanking(fixture!.store.id, year, month);
    expect(rows.find((r) => r.productId === fixture!.component.id)?.totalRevenue).toBe(SALE);
    expect(rows.every((r) => r.totalRevenue < GIFT)).toBe(true);
  });

  it("actions/get-financial-analytics.ts (monthly, daily, month over month)", async () => {
    const { getMonthlyFinancialSummary, getDailyFinancialBreakdown, getMonthOverMonthComparison } = await import("@/actions/get-financial-analytics");
    const summary = await getMonthlyFinancialSummary(fixture!.store.id, year, month);
    expect(summary).toMatchObject({ total_revenue: SALE, total_orders: 1 });
    const daily = await getDailyFinancialBreakdown(fixture!.store.id, year, month);
    expect(daily.reduce((sum, d) => sum + d.revenue, 0)).toBe(SALE);
    const mom = await getMonthOverMonthComparison(fixture!.store.id, year, month);
    expect(mom.currentMonth.total_revenue).toBe(SALE);
  });

  it("actions/get-customer-intelligence.ts", async () => {
    const { getCustomerIntelligence } = await import("@/actions/get-customer-intelligence");
    const profiles = await getCustomerIntelligence(fixture!.store.id);
    const luisa = profiles.find((p) => p.email === customer.email);
    expect(luisa).toMatchObject({ totalSpent: SALE, totalOrders: 1 });
  });

  it("app/(dashboard)/[storeId]/(routes)/clientes/server/get-customers.ts", async () => {
    const { getCustomers } = await import("@/app/(dashboard)/[storeId]/(routes)/clientes/server/get-customers");
    const { records } = await getCustomers(fixture!.store.id, new Date());
    const luisa = records.find((r) => JSON.stringify(r).includes("3001234567"));
    expect(luisa).toMatchObject({ totalSpent: SALE, paidOrders: 1 });
  });

  it("lib/dashboard-today.ts", async () => {
    const { getTodaySummary } = await import("@/lib/dashboard-today");
    const summary = await getTodaySummary(fixture!.store.id, new Date());
    expect(summary.today).toMatchObject({ net: SALE, orders: 1 });
    expect(summary.week.net).toBe(SALE);
  });

  it("lib/sales-watermark.ts", async () => {
    const { salesWatermark } = await import("@/lib/sales-watermark");
    expect(await salesWatermark(fixture!.store.id)).toMatch(/^1:/);
  });

  it("lib/tax-reports.ts (sale date and payment date)", async () => {
    const { getTaxReport, createTaxReportPeriod, TAX_SALES_DATE_BASIS } = await import("@/lib/tax-reports");
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const period = createTaxReportPeriod(iso(new Date(now.getTime() - 2 * 86400000)), iso(new Date(now.getTime() + 2 * 86400000)));
    for (const basis of [TAX_SALES_DATE_BASIS.SALE_DATE, TAX_SALES_DATE_BASIS.PAYMENT_DATE]) {
      const report = await getTaxReport(fixture!.store.id, period, basis);
      expect(report.salesTotal).toBe(SALE);
      expect(report.sales).toHaveLength(1);
    }
  });

  it("lib/tax-readiness.ts", async () => {
    // Una compra de tarjeta pagada sin fecha no es un «pago sin fecha» que declarar.
    await testPrisma.order.create({
      data: { storeId: fixture!.store.id, orderNumber: `ORD-GC-${randomUUID().slice(0, 8)}`, status: OrderStatus.PAID, paidAt: null, type: OrderType.GIFT_CARD, ...customer, subtotal: GIFT, total: GIFT },
    });
    const { getTaxReadiness } = await import("@/lib/tax-readiness");
    const readiness = await getTaxReadiness(fixture!.store.id, year);
    expect(readiness.items.some((item) => item.id === "paid-without-date")).toBe(false);
  });

  it("lib/financial.ts: a gift-card purchase carries no product cost or profit", async () => {
    const { calculateOrderFinancials } = await import("@/lib/financial");
    const gift = await testPrisma.order.findFirstOrThrow({ where: { storeId: fixture!.store.id, type: OrderType.GIFT_CARD }, include: { orderItems: true } });
    const metrics = await calculateOrderFinancials(gift as never, PaymentMethod.Wompi, 0, testPrisma);
    expect(metrics.totalProductCost).toBe(0);
    expect(metrics.gatewayFee).toBeGreaterThan(0);
    expect(metrics.netProfit).toBe(-metrics.gatewayFee);
    expect(metrics.profitMarginPct).toBe(0);
  });
});
