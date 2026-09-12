import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { getInventory } from "@/app/(dashboard)/[storeId]/(routes)/inventario/server/get-inventory";
import { OrderStatus, OrderType, PaymentMethod, RestockOrderStatus } from "@prisma/client";

/** Reposición por cobertura: ventas de 30/90 días por OrderItem, en camino por pedidos abiertos, último costo. */
describe("getInventory con señal de reposición", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      const orders = await testPrisma.restockOrder.findMany({ where: { storeId: fixture.store.id }, select: { id: true } });
      await testPrisma.restockOrderItem.deleteMany({ where: { restockOrderId: { in: orders.map((o) => o.id) } } });
      await testPrisma.restockOrder.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.orderItem.deleteMany({ where: { order: { storeId: fixture.store.id } } });
      await testPrisma.order.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.product.updateMany({ where: { storeId: fixture.store.id }, data: { supplierId: null } });
      await testPrisma.supplier.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("computes sold units, cover, on-order units and the last purchase cost per product", async () => {
    fixture = await createInventoryFixture();
    const now = new Date("2026-09-12T12:00:00.000Z");
    const paidAt = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000);
    const customer = { fullName: "Cliente", phone: "3000000000", address: "Calle 1", email: "c@test.com" };
    for (const [days, quantity] of [[2, 4], [10, 6], [60, 5]] as const) {
      await testPrisma.order.create({
        data: {
          storeId: fixture.store.id, orderNumber: `ORD-R-${randomUUID()}`, status: OrderStatus.PAID, type: OrderType.STANDARD, ...customer, subtotal: 1, total: 1, paidAt: paidAt(days),
          payment: { create: { method: PaymentMethod.CASH, storeId: fixture.store.id } },
          orderItems: { create: [{ productId: fixture.component.id, quantity, name: "Componente", price: 1 }] },
        },
      });
    }
    // Un pedido sin pagar no cuenta.
    await testPrisma.order.create({
      data: { storeId: fixture.store.id, orderNumber: `ORD-R-${randomUUID()}`, status: OrderStatus.PENDING, type: OrderType.STANDARD, ...customer, subtotal: 1, total: 1, orderItems: { create: [{ productId: fixture.component.id, quantity: 50, name: "Componente", price: 1 }] } },
    });
    const supplier = await testPrisma.supplier.create({ data: { storeId: fixture.store.id, name: `Prov ${randomUUID()}` } });
    await testPrisma.restockOrder.create({
      data: { storeId: fixture.store.id, supplierId: supplier.id, orderNumber: "PO-0001", status: RestockOrderStatus.ORDERED, totalAmount: 30000, items: { create: [{ productId: fixture.component.id, quantity: 5, quantityReceived: 2, cost: 3000, subtotal: 15000 }] } },
    });

    const rows = await getInventory(fixture.store.id, now);
    const component = rows.find((row) => row.id === fixture!.component.id)!;
    expect(component.sold30).toBe(10);
    expect(component.sold90).toBe(15);
    expect(component.onOrder).toBe(3);
    expect(component.lastCost).toBe(3000);
    // 6 en stock, 10 vendidas en 30 días → 18 días de cobertura; con 3 en camino, 27.
    expect(component.signal.coverDays).toBe(18);
    expect(component.signal.coverDaysWithOnOrder).toBe(27);
    expect(component.signal.suggested).toBe(Math.ceil((10 / 30) * 28 - 6 - 3));
    // El kit (stock 0, sin ventas propias) no vende: durmiente no, porque su stock es 0 → simplemente fuera de «por reponer».
    const kit = rows.find((row) => row.id === fixture!.kit.id)!;
    expect(kit.signal.needsReplenishment).toBe(false);
    expect(kit.limitingComponent).toBe("Componente");
  });
});
