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
    // Recibido a medias: 2 de 5 llegaron a $3.000 → costo de compra real y 3 en camino.
    await testPrisma.restockOrder.create({
      data: { storeId: fixture.store.id, supplierId: supplier.id, orderNumber: "PO-0001", status: RestockOrderStatus.PARTIALLY_RECEIVED, totalAmount: 30000, items: { create: [{ productId: fixture.component.id, quantity: 5, quantityReceived: 2, cost: 3000, subtotal: 15000 }] } },
    });
    // Un borrador posterior con otro costo no es una compra: no cambia el «último costo».
    await testPrisma.restockOrder.create({
      data: { storeId: fixture.store.id, supplierId: supplier.id, orderNumber: "PO-0002", status: RestockOrderStatus.DRAFT, totalAmount: 9999, items: { create: [{ productId: fixture.component.id, quantity: 1, quantityReceived: 0, cost: 9999, subtotal: 9999 }] } },
    });

    const rows = await getInventory(fixture.store.id, now);
    const component = rows.find((row) => row.id === fixture!.component.id)!;
    expect(component.sold30).toBe(10);
    expect(component.sold90).toBe(15);
    expect(component.onOrder).toBe(3);
    expect(component.lastCost).toBe(3000);
    expect(component.lastCostSource).toBe("purchase");
    // 6 en stock, 10 vendidas en 30 días → 18 días de cobertura; con 3 en camino, 27.
    expect(component.signal.coverDays).toBe(18);
    expect(component.signal.coverDaysWithOnOrder).toBe(27);
    expect(component.signal.suggested).toBe(Math.ceil((10 / 30) * 28 - 6 - 3));
    // El kit (stock 0, sin ventas propias) no vende: durmiente no, porque su stock es 0 → simplemente fuera de «por reponer».
    const kit = rows.find((row) => row.id === fixture!.kit.id)!;
    expect(kit.signal.needsReplenishment).toBe(false);
    expect(kit.limitingComponent).toBe("Componente");
    expect(kit.lastCost).toBeNull();
  });

  it("counts a paid order without paidAt by its creation date and adds kit sales to the component", async () => {
    fixture = await createInventoryFixture();
    const now = new Date("2026-09-12T12:00:00.000Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000);
    const customer = { fullName: "Cliente", phone: "3000000000", address: "Calle 1", email: "c@test.com" };
    // Pagado por transferencia sin `paidAt` (los anteriores al 2026-09-10): vale la fecha de creación.
    await testPrisma.order.create({
      data: {
        storeId: fixture.store.id, orderNumber: `ORD-R-${randomUUID()}`, status: OrderStatus.PAID, type: OrderType.STANDARD, ...customer, subtotal: 1, total: 1, paidAt: null, createdAt: daysAgo(3),
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: fixture.store.id } },
        orderItems: { create: [{ productId: fixture.component.id, quantity: 4, name: "Componente", price: 1 }] },
      },
    });
    // Tres kits vendidos (2 componentes cada uno) consumen 6 componentes.
    await testPrisma.order.create({
      data: {
        storeId: fixture.store.id, orderNumber: `ORD-R-${randomUUID()}`, status: OrderStatus.PAID, type: OrderType.STANDARD, ...customer, subtotal: 1, total: 1, paidAt: daysAgo(5),
        payment: { create: { method: PaymentMethod.CASH, storeId: fixture.store.id } },
        orderItems: { create: [{ productId: fixture.kit.id, quantity: 3, name: "Kit", price: 1 }] },
      },
    });

    const rows = await getInventory(fixture.store.id, now);
    const component = rows.find((row) => row.id === fixture!.component.id)!;
    expect(component.sold30).toBe(10);
    expect(component.soldViaKits30).toBe(6);
    expect(component.sold90).toBe(10);
    const kit = rows.find((row) => row.id === fixture!.kit.id)!;
    expect(kit.sold30).toBe(3);
    expect(kit.soldViaKits30).toBe(0);
  });
});
