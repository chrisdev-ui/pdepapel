import { afterEach, describe, expect, it } from "vitest";

import { applyOrderFinancialsBackfill, orderFinancialsPlan } from "@/lib/order-financials-backfill";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/** El relleno de financieros por la misma lógica que corre el guion, contra MySQL de pruebas. Valores de prueba. */
describe("financieros de pedidos pagados sin costo guardado", () => {
  let fixture: InventoryFixture | undefined;
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
  });

  async function seed() {
    fixture = await createInventoryFixture();
    const f = fixture;
    // El costo propio del kit no cuenta: vale lo de sus piezas (2 × 4.000).
    await testPrisma.product.update({ where: { id: f.kit.id }, data: { acqPrice: 1 } });
    // Con envío por unidad registrado: el relleno es solo de compra y no lo suma.
    await testPrisma.product.update({ where: { id: f.component.id }, data: { transportationCost: 300 } });
    const paidAt = new Date("2026-08-20T15:00:00Z");
    let n = 0;
    const order = (lines: { productId: string | null; quantity: number }[], extra: Record<string, unknown> = {}) =>
      testPrisma.order.create({
        data: {
          storeId: f.store.id,
          orderNumber: `BACKFILL-${(n += 1)}-${Date.now()}`,
          status: "PAID",
          type: "STANDARD",
          createdAt: paidAt,
          paidAt,
          subtotal: 20000,
          total: 25000,
          payment: { create: { storeId: f.store.id, method: "BankTransfer" } },
          shipping: { create: { storeId: f.store.id, cost: 4000, codFee: 1000 } },
          orderItems: { create: lines.map((line) => ({ productId: line.productId, quantity: line.quantity, name: "Línea", price: 10000, isCustom: !line.productId })) },
          ...extra,
        },
        select: { id: true },
      });
    return {
      rebuildable: await order([{ productId: f.component.id, quantity: 2 }]),
      kit: await order([{ productId: f.kit.id, quantity: 1 }], { status: "SENT" }),
      partial: await order([{ productId: f.component.id, quantity: 1 }, { productId: null, quantity: 1 }]),
      withCost: await order([{ productId: f.component.id, quantity: 1 }], { totalProductCost: 4000, netProfit: 0 }),
      pending: await order([{ productId: f.component.id, quantity: 1 }], { status: "PENDING", paidAt: null }),
      giftCard: await order([], { type: "GIFT_CARD" }),
    };
  }

  const run = <T>(work: (tx: Parameters<Parameters<typeof testPrisma.$transaction>[0]>[0]) => Promise<T>) => testPrisma.$transaction((tx) => work(tx));
  const financials = (id: string) =>
    testPrisma.order.findUniqueOrThrow({
      where: { id },
      select: { totalProductCost: true, gatewayFee: true, shippingCost: true, netProfit: true, profitMarginPct: true, productShippingCost: true, productShippingMissing: true },
    });

  it("el ensayo: completos a escribir con el costo de compra de hoy (un kit por sus piezas); parciales a revisión; los demás fuera", async () => {
    const rows = await seed();
    const plan = await orderFinancialsPlan(testPrisma, fixture!.store.id);
    const byId = new Map(plan.rows.map((row) => [row.id, row]));
    // 25.000 − 2 × 4.000 − 0 de pasarela (transferencia) − (4.000 de envío + 1.000 de recaudo) = 12.000.
    expect(byId.get(rows.rebuildable.id)).toEqual({ id: rows.rebuildable.id, totalProductCost: 8000, gatewayFee: 0, shippingCost: 5000, netProfit: 12000, profitMarginPct: 48 });
    expect(byId.get(rows.kit.id)).toMatchObject({ totalProductCost: 8000, netProfit: 12000 });
    expect(plan.rows.map((row) => row.id).sort()).toEqual([rows.rebuildable.id, rows.kit.id].sort());
    expect(plan.manualReview).toEqual([{ id: rows.partial.id, reason: "1 de 2 líneas sin producto o sin costo hoy" }]);
  });

  it("aplica el plan revisado una sola vez; el envío por unidad no se suma y sus columnas quedan NULL", async () => {
    const rows = await seed();
    const plan = await orderFinancialsPlan(testPrisma, fixture!.store.id);
    await expect(applyOrderFinancialsBackfill(plan, 3, run, fixture!.store.id)).rejects.toThrow("se esperaban 3");

    await expect(applyOrderFinancialsBackfill(plan, 2, run, fixture!.store.id)).resolves.toEqual({ written: 2 });
    expect(await financials(rows.rebuildable.id)).toEqual({ totalProductCost: 8000, gatewayFee: 0, shippingCost: 5000, netProfit: 12000, profitMarginPct: 48, productShippingCost: null, productShippingMissing: null });
    expect((await financials(rows.kit.id)).totalProductCost).toBe(8000);
    expect((await financials(rows.partial.id)).totalProductCost).toBeNull();
    expect(await financials(rows.withCost.id)).toMatchObject({ totalProductCost: 4000, netProfit: 0 });

    expect((await orderFinancialsPlan(testPrisma, fixture!.store.id)).rows).toEqual([]);
    await expect(applyOrderFinancialsBackfill(plan, 2, run, fixture!.store.id)).rejects.toThrow("cambió desde el ensayo");
  });

  it("si un campo o un costo cambia entre el ensayo y la escritura, no escribe nada", async () => {
    const rows = await seed();
    const plan = await orderFinancialsPlan(testPrisma, fixture!.store.id);
    await testPrisma.order.update({ where: { id: rows.kit.id }, data: { netProfit: 7000 } });
    await expect(applyOrderFinancialsBackfill(plan, 2, run, fixture!.store.id)).rejects.toThrow("cambió desde el ensayo");
    expect((await financials(rows.rebuildable.id)).totalProductCost).toBeNull();

    await testPrisma.order.update({ where: { id: rows.kit.id }, data: { netProfit: null } });
    const fresh = await orderFinancialsPlan(testPrisma, fixture!.store.id);
    await testPrisma.product.update({ where: { id: fixture!.component.id }, data: { acqPrice: 4500 } });
    await expect(applyOrderFinancialsBackfill(fresh, 2, run, fixture!.store.id)).rejects.toThrow("cambió desde el ensayo");
    expect((await financials(rows.rebuildable.id)).totalProductCost).toBeNull();
    expect((await financials(rows.kit.id)).totalProductCost).toBeNull();
  });
});
