/// <reference types="vite/client" />
import { InventoryMovementType, OrderStatus, OrderType, PaymentMethod, RestockOrderStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null }),
  clerkClient: async () => ({
    users: {
      getUser: vi.fn(async (id: string) => (id === "user_camila" ? { firstName: "Camila", lastName: "Torres", username: "camila" } : null)),
    },
  }),
}));

import {
  getProductKardex,
  KARDEX_ALL_TAKE,
  KARDEX_WINDOW_DAYS,
  KARDEX_WINDOW_TAKE,
} from "@/app/(dashboard)/[storeId]/(routes)/movimientos-inventario/producto/[productId]/server/get-product-kardex";

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

interface SeedRow {
  createdAt: Date;
  type?: InventoryMovementType;
  quantity?: number;
  previousStock?: number;
  newStock?: number;
  referenceId?: string;
  createdBy?: string | null;
  reason?: string;
  description?: string;
}

/**
 * El kardex de producto lee la misma tabla que la lista general, pero
 * resuelve referencias (pedido, orden de aprovisionamiento, feria), calcula
 * métricas de 30/90 días y cuadra el último saldo contra `Product.stock`.
 */
describe("product kardex loader with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let supplierId: string | undefined;
  let restockOrderId: string | undefined;
  const now = new Date("2026-09-12T15:00:00.000Z");

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (restockOrderId) {
      await testPrisma.restockOrder.deleteMany({ where: { id: restockOrderId } });
      restockOrderId = undefined;
    }
    if (supplierId) {
      await testPrisma.supplier.deleteMany({ where: { id: supplierId } });
      supplierId = undefined;
    }
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const seed = async (rows: SeedRow[], productId?: string) => {
    const current = fixture!;
    await testPrisma.inventoryMovement.createMany({
      data: rows.map((row, index) => ({
        storeId: current.store.id,
        productId: productId ?? current.component.id,
        type: row.type ?? InventoryMovementType.MANUAL_ADJUSTMENT,
        quantity: row.quantity ?? 1,
        previousStock: row.previousStock ?? index,
        newStock: row.newStock ?? index + 1,
        reason: row.reason ?? "prueba",
        description: row.description ?? null,
        referenceId: row.referenceId ?? null,
        createdAt: row.createdAt,
        createdBy: row.createdBy === undefined ? "SYSTEM" : row.createdBy,
      })),
    });
  };

  it("returns null when the product belongs to another store", async () => {
    fixture = await createInventoryFixture();
    const otherStore = await testPrisma.store.create({ data: { name: `Otra tienda ${randomUUID()}`, userId: `other-${randomUUID()}` } });
    try {
      expect(await getProductKardex(otherStore.id, fixture.component.id, { now })).toBeNull();
      expect(await getProductKardex(fixture.store.id, "no-existe", { now })).toBeNull();
    } finally {
      await testPrisma.store.delete({ where: { id: otherStore.id } });
    }
  });

  it("bounds the default history to 90 days, reports the opening balance and lifts the window with all", async () => {
    fixture = await createInventoryFixture();
    await seed([
      { createdAt: daysAgo(now, 400), previousStock: 0, newStock: 10 },
      { createdAt: daysAgo(now, 200), previousStock: 10, newStock: 12 },
      { createdAt: daysAgo(now, KARDEX_WINDOW_DAYS + 1), previousStock: 12, newStock: 9, quantity: -3 },
      { createdAt: daysAgo(now, 10), previousStock: 9, newStock: 7, quantity: -2 },
      { createdAt: daysAgo(now, 1), previousStock: 7, newStock: 6, quantity: -1 },
    ]);

    const recent = await getProductKardex(fixture.store.id, fixture.component.id, { now });
    expect(recent).not.toBeNull();
    expect(recent!.rows.map((row) => row.newStock)).toEqual([6, 7]);
    expect(recent!.windowDays).toBe(KARDEX_WINDOW_DAYS);
    expect(recent!.hasMore).toBe(false);
    // Saldo justo antes de la fila más antigua mostrada, con los movimientos anteriores.
    expect(recent!.openingBalance).toBe(9);
    expect(recent!.olderCount).toBe(3);
    expect(recent!.totalCount).toBe(5);
    expect(recent!.firstMovementAt?.getTime()).toBe(daysAgo(now, 400).getTime());

    const all = await getProductKardex(fixture.store.id, fixture.component.id, { now, all: true });
    expect(all!.rows).toHaveLength(5);
    expect(all!.windowDays).toBeNull();
    expect(all!.openingBalance).toBe(0);
    expect(all!.olderCount).toBe(0);
    expect(KARDEX_ALL_TAKE).toBeGreaterThan(KARDEX_WINDOW_TAKE);
  });

  it("filters by type without changing the metrics", async () => {
    fixture = await createInventoryFixture();
    await seed([
      { createdAt: daysAgo(now, 3), type: InventoryMovementType.DAMAGE, quantity: -1, previousStock: 7, newStock: 6 },
      { createdAt: daysAgo(now, 2), type: InventoryMovementType.ORDER_PLACED, quantity: -2, previousStock: 6, newStock: 4, createdBy: null },
      { createdAt: daysAgo(now, 1), type: InventoryMovementType.RESTOCK_RECEIVED, quantity: 2, previousStock: 4, newStock: 6 },
    ]);

    const onlySales = await getProductKardex(fixture.store.id, fixture.component.id, { now, type: InventoryMovementType.ORDER_PLACED });
    expect(onlySales!.rows).toHaveLength(1);
    expect(onlySales!.rows[0].type).toBe("ORDER_PLACED");
    expect(onlySales!.rows[0].who).toBe("Tienda en línea");
    expect(onlySales!.metrics.sold30).toBe(2);
    expect(onlySales!.metrics.received90).toBe(2);
    expect(onlySales!.metrics.adjustments90).toEqual({ total: -1, byType: { DAMAGE: 1 } });
  });

  it("flags when Product.stock drifted from the latest movement balance", async () => {
    fixture = await createInventoryFixture();
    // El componente del fixture tiene stock 6.
    await seed([{ createdAt: daysAgo(now, 1), previousStock: 5, newStock: 6 }]);
    const balanced = await getProductKardex(fixture.store.id, fixture.component.id, { now });
    expect(balanced!.metrics.balanced).toBe(true);
    expect(balanced!.metrics.latestBalance).toBe(6);

    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { stock: 9 } });
    const drifted = await getProductKardex(fixture.store.id, fixture.component.id, { now });
    expect(drifted!.product.stock).toBe(9);
    expect(drifted!.metrics.balanced).toBe(false);
    expect(drifted!.metrics.latestBalance).toBe(6);
  });

  it("derives sales, weekly rate and cover days from the last 30 days", async () => {
    fixture = await createInventoryFixture();
    await seed([
      { createdAt: daysAgo(now, 45), type: InventoryMovementType.ORDER_PLACED, quantity: -10, previousStock: 20, newStock: 10 },
      { createdAt: daysAgo(now, 5), type: InventoryMovementType.IN_PERSON_SALE, quantity: -3, previousStock: 10, newStock: 7 },
      { createdAt: daysAgo(now, 4), type: InventoryMovementType.ORDER_PLACED, quantity: -3, previousStock: 7, newStock: 4 },
      { createdAt: daysAgo(now, 3), type: InventoryMovementType.ORDER_CANCELLED, quantity: 3, previousStock: 4, newStock: 7 },
      { createdAt: daysAgo(now, 2), type: InventoryMovementType.MANUAL_ADJUSTMENT, quantity: -1, previousStock: 7, newStock: 6 },
    ]);
    const result = await getProductKardex(fixture.store.id, fixture.component.id, { now });
    expect(result!.metrics.sold30).toBe(3);
    expect(result!.metrics.weeklyRate).toBe(0.7);
    // stock 6 / (3 ventas / 30 días) = 60 días.
    expect(result!.metrics.coverDays).toBe(60);
  });

  it("resolves order, restock and fair references scoped to the store and names Clerk users", async () => {
    fixture = await createInventoryFixture();
    const supplier = await testPrisma.supplier.create({ data: { storeId: fixture.store.id, name: `Henko ${randomUUID().slice(0, 6)}` } });
    supplierId = supplier.id;
    await testPrisma.product.update({ where: { id: fixture.component.id }, data: { supplierId: supplier.id } });
    const restock = await testPrisma.restockOrder.create({
      data: { storeId: fixture.store.id, supplierId: supplier.id, orderNumber: `PO-${randomUUID().slice(0, 8)}`, status: RestockOrderStatus.COMPLETED },
    });
    restockOrderId = restock.id;
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PAID,
        type: OrderType.STANDARD,
        paidAt: now,
        fullName: "Ana Pérez",
        city: "Medellín",
        subtotal: 20000,
        total: 20000,
        orderItems: { create: [{ productId: fixture.component.id, quantity: 2, name: fixture.component.name, price: 10000, sku: fixture.component.sku }] },
        payment: { create: { method: PaymentMethod.CASH, storeId: fixture.store.id } },
      },
    });
    const fair = await testPrisma.fairEvent.create({ data: { storeId: fixture.store.id, name: "Feria Kawaii", createdBy: fixture.store.userId } });
    // Un pedido de otra tienda con el mismo id de referencia no debe resolverse.
    const otherStore = await testPrisma.store.create({ data: { name: `Otra ${randomUUID()}`, userId: `other-${randomUUID()}` } });
    const foreignOrder = await testPrisma.order.create({
      data: { storeId: otherStore.id, orderNumber: `ORD-FOREIGN-${randomUUID()}`, status: OrderStatus.PAID, type: OrderType.STANDARD, fullName: "Otra tienda", subtotal: 0, total: 0 },
    });

    try {
      await seed([
        { createdAt: daysAgo(now, 6), type: InventoryMovementType.RESTOCK_RECEIVED, quantity: 10, previousStock: 0, newStock: 10, referenceId: restock.id, createdBy: "USER_user_camila" },
        { createdAt: daysAgo(now, 5), type: InventoryMovementType.FESTIVAL_ALLOCATION, quantity: -4, previousStock: 10, newStock: 6, referenceId: fair.id, createdBy: "USER_user_camila" },
        { createdAt: daysAgo(now, 4), type: InventoryMovementType.ORDER_PLACED, quantity: -2, previousStock: 6, newStock: 4, referenceId: order.id, createdBy: null },
        { createdAt: daysAgo(now, 3), type: InventoryMovementType.IN_PERSON_SALE, quantity: -1, previousStock: 4, newStock: 3, referenceId: foreignOrder.id, createdBy: "USER_unknown", reason: "Venta mostrador" },
        { createdAt: daysAgo(now, 2), type: InventoryMovementType.DAMAGE, quantity: -1, previousStock: 3, newStock: 2, createdBy: "SYSTEM_MIGRATION_SCRIPT", reason: "Se mojó", description: "Caja del fondo" },
      ]);

      const result = await getProductKardex(fixture.store.id, fixture.component.id, { now });
      expect(result!.product.supplier).toEqual({ id: supplier.id, name: supplier.name });
      const byType = new Map(result!.rows.map((row) => [row.type, row]));

      expect(byType.get("RESTOCK_RECEIVED")!.reference).toEqual({
        kind: "restock",
        label: restock.orderNumber,
        secondary: supplier.name,
        href: `/${fixture.store.id}/aprovisionamiento/${restock.id}`,
      });
      expect(byType.get("RESTOCK_RECEIVED")!.who).toBe("Camila");
      expect(byType.get("FESTIVAL_ALLOCATION")!.reference).toEqual({ kind: "fair", label: "Feria Kawaii", secondary: null, href: `/${fixture.store.id}/ferias/${fair.id}` });
      expect(byType.get("ORDER_PLACED")!.reference).toEqual({
        kind: "order",
        label: order.orderNumber,
        secondary: "Ana Pérez · Medellín",
        href: `/${fixture.store.id}/pedidos/${order.id}`,
      });
      expect(byType.get("ORDER_PLACED")!.who).toBe("Tienda en línea");
      // Referencia de otra tienda: se cae a la razón escrita, sin enlace.
      expect(byType.get("IN_PERSON_SALE")!.reference).toEqual({ kind: "note", label: "“Venta mostrador”", secondary: null, href: null });
      expect(byType.get("IN_PERSON_SALE")!.who).toBe("Usuario");
      expect(byType.get("DAMAGE")!.reference).toEqual({ kind: "note", label: "“Se mojó”", secondary: "Caja del fondo", href: null });
      expect(byType.get("DAMAGE")!.who).toBe("Sistema");
    } finally {
      await testPrisma.order.deleteMany({ where: { id: foreignOrder.id } });
      await testPrisma.store.delete({ where: { id: otherStore.id } });
    }
  });
});
