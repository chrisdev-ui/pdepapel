import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderInventoryIssueKind, OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { countOrdersToAttend, listOrderPage, parseOrderListQuery } from "@/lib/order-list";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Regresión del 26 oct: 4 pedidos viejos y entregados se quedaban en «Por
 * atender» por 20 líneas de inventario sin cuadrar, y el número del menú
 * contaba los PENDING (otros 4). Ahora el menú usa la regla de la pestaña, la
 * deuda de un pedido terminado vive en «Inventario sin cuadrar», y se puede
 * conciliar todo un pedido de una vez.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }), clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }) }));

let f: InventoryFixture;

beforeAll(async () => {
  f = await createInventoryFixture();
});
afterEach(() => {
  session.userId = null;
});
afterAll(async () => {
  await deleteInventoryFixture(f);
});

async function order(opts: { status: OrderStatus; shipping?: { provider: ShippingProvider; status: ShippingStatus } | null; method?: PaymentMethod; issues?: number; createdAt?: Date }) {
  const created = await testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: opts.status,
      paidAt: opts.status === OrderStatus.PAID || opts.status === OrderStatus.SENT ? new Date() : null,
      createdAt: opts.createdAt,
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      fullName: "Clienta Atender",
      phone: "+573001234567",
      address: "Calle 1 # 2-3",
      subtotal: 10000,
      total: 10000,
      payment: { create: { storeId: f.store.id, method: opts.method ?? PaymentMethod.BankTransfer } },
      ...(opts.shipping ? { shipping: { create: { storeId: f.store.id, ...opts.shipping } } } : {}),
    },
  });
  for (let i = 0; i < (opts.issues ?? 0); i += 1) {
    await testPrisma.orderInventoryIssue.create({
      data: { storeId: f.store.id, orderId: created.id, orderNumber: created.orderNumber, kind: OrderInventoryIssueKind.DECREMENT, productId: f.component.id, productName: f.component.name, quantity: 1, reason: "Stock insuficiente. Disponible: 0" },
    });
  }
  return created;
}

describe("Por atender, el menú e Inventario sin cuadrar", () => {
  it("el número del menú es exactamente el de la pestaña «Por atender»", async () => {
    // Entregado con deuda (los 4 de producción): no.
    await order({ status: OrderStatus.SENT, shipping: { provider: ShippingProvider.NONE, status: ShippingStatus.Delivered }, issues: 13 });
    // PENDING viejo ya entregado: el menú de antes lo contaba.
    await order({ status: OrderStatus.PENDING, shipping: { provider: ShippingProvider.NONE, status: ShippingStatus.Delivered }, createdAt: new Date("2024-12-16T00:00:00Z") });
    // Transferencia por verificar: sí.
    await order({ status: OrderStatus.PENDING, shipping: { provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing } });
    // Pagado sin guía: por despachar, sí.
    await order({ status: OrderStatus.PAID, shipping: { provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing } });
    // En curso con deuda: sí (la deuda pide atención mientras sigue activo).
    await order({ status: OrderStatus.PAID, shipping: { provider: ShippingProvider.NONE, status: ShippingStatus.Preparing }, issues: 1 });

    const tab = await listOrderPage(testPrisma, f.store.id, parseOrderListQuery({ vista: "por-atender" }));
    const badge = await countOrdersToAttend(testPrisma, f.store.id);
    expect(badge).toBe(tab.counts["por-atender"]);
    expect(badge).toBe(3);
    expect(tab.counts["sin-cuadrar"]).toBe(2);
  });

  it("«Conciliar todas las líneas»: solo la dueña, cierra todas sin mover stock y no toca otras tiendas", async () => {
    const o = await order({ status: OrderStatus.SENT, shipping: { provider: ShippingProvider.MANUAL, status: ShippingStatus.Delivered }, issues: 3 });
    const stockBefore = (await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id }, select: { stock: true } })).stock;
    const movementsBefore = await testPrisma.inventoryMovement.count({ where: { productId: f.component.id } });
    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/inventory-issues/resolve-all/route");
    const call = (storeId: string) => POST(new Request("http://admin.test/api/x", { method: "POST" }), { params: { storeId, orderId: o.id } });

    expect((await call(f.store.id)).status).toBe(401);
    session.userId = "otra-persona";
    expect([401, 403]).toContain((await call(f.store.id)).status);

    session.userId = f.store.userId;
    const response = await call(f.store.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ resolved: 3 });
    const issues = await testPrisma.orderInventoryIssue.findMany({ where: { orderId: o.id } });
    expect(issues.every((i) => i.resolvedAt && i.resolvedBy === f.store.userId && i.movementId === null)).toBe(true);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: f.component.id }, select: { stock: true } })).stock).toBe(stockBefore);
    expect(await testPrisma.inventoryMovement.count({ where: { productId: f.component.id } })).toBe(movementsBefore);

    expect((await call(f.store.id)).status).toBe(404);
  });
});
