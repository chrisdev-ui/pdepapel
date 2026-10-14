import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderStatus, OrderType, PaymentMethod, ShippingStatus } from "@prisma/client";

import { ORDER_VIEWS, getOrderQueue, orderMatchesView } from "@/lib/order-queues";
import { ORDER_PAGE_SIZE, ORDER_QUEUE_SELECT, listOrderPage, parseOrderListQuery } from "@/lib/order-list";
import { getOrderDateRange } from "@/lib/order-list-filters";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Pedidos paginado en el servidor contra MySQL: los conteos de cada pestaña
 * son los mismos que daría clasificar todos los pedidos en el navegador (como
 * antes), los filtros de canal, fecha y búsqueda van en la consulta, y las
 * páginas no repiten ni pierden pedidos.
 */
const session = vi.hoisted(() => ({ userId: null as string | null, role: "owner" as "owner" | "viewer" }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

const DAY = 86_400_000;
let fixture: InventoryFixture | undefined;

beforeAll(async () => {
  await testPrisma.$connect();
  fixture = await createInventoryFixture();
  session.userId = fixture.store.userId;
  const store = fixture.store.id;
  await testPrisma.image.createMany({
    data: [
      { productId: fixture.component.id, url: "https://images.test/principal.jpg", isMain: true },
      { productId: fixture.component.id, url: "https://images.test/otra-1.jpg", isMain: false },
      { productId: fixture.component.id, url: "https://images.test/otra-2.jpg", isMain: false },
    ],
  });
  const make = (i: number, data: { type: OrderType; status: OrderStatus; method: PaymentMethod; daysAgo: number; name?: string; shipping?: ShippingStatus; tracking?: string }) =>
    testPrisma.order.create({
      data: {
        storeId: store,
        orderNumber: `ORD-LST-${String(i).padStart(3, "0")}-${randomBytes(2).toString("hex")}`,
        type: data.type,
        status: data.status,
        fullName: data.name ?? `Clienta ${i}`,
        phone: `30000000${String(i).padStart(2, "0")}`,
        subtotal: 10000,
        total: 10000,
        createdAt: new Date(Date.now() - data.daysAgo * DAY),
        paidAt: data.status === OrderStatus.PAID ? new Date(Date.now() - data.daysAgo * DAY) : null,
        orderItems: { create: [{ productId: fixture!.component.id, quantity: 1, price: 10000, name: i === 7 ? "Lapicero especial" : "Componente", imageUrl: "https://images.test/linea.jpg" }] },
        payment: { create: { method: data.method, storeId: store } },
        ...(data.shipping ? { shipping: { create: { storeId: store, status: data.shipping, trackingCode: data.tracking ?? null, cost: 0 } } } : {}),
      } as never,
    });
  let i = 0;
  // 30 transferencias por verificar (dos páginas en «Por verificar»), 5 ventas presenciales, 3 en camino, 2 canceladas.
  for (let n = 0; n < 30; n += 1) await make(i++, { type: OrderType.STANDARD, status: OrderStatus.PENDING, method: PaymentMethod.BankTransfer, daysAgo: n % 10 });
  for (let n = 0; n < 5; n += 1) await make(i++, { type: OrderType.POINT_OF_SALE, status: OrderStatus.PAID, method: PaymentMethod.CASH, daysAgo: 1 });
  for (let n = 0; n < 3; n += 1) await make(i++, { type: OrderType.STANDARD, status: OrderStatus.PAID, method: PaymentMethod.Bold, daysAgo: 3, shipping: ShippingStatus.InTransit, tracking: `G-${n}` });
  for (let n = 0; n < 2; n += 1) await make(i++, { type: OrderType.STANDARD, status: OrderStatus.CANCELLED, method: PaymentMethod.Bold, daysAgo: 20, name: "Buscada Rara" });
});

afterAll(async () => {
  if (fixture) {
    await testPrisma.image.deleteMany({ where: { productId: fixture.component.id } });
    await deleteInventoryFixture(fixture);
  }
  await testPrisma.$disconnect();
});

describe("Pedidos paginado en el servidor (MySQL)", () => {
  it("los conteos de cada pestaña son los de clasificar todos los pedidos, y las páginas no repiten ni pierden", async () => {
    const store = fixture!.store.id;
    const now = new Date();
    const all = await testPrisma.order.findMany({ where: { storeId: store }, select: ORDER_QUEUE_SELECT });
    for (const view of ORDER_VIEWS) {
      const expected = all.filter((row) => orderMatchesView(getOrderQueue({ ...row, openInventoryIssues: row._count.inventoryIssues }, now), view.id, { ...row, openInventoryIssues: row._count.inventoryIssues }, now)).length;
      const page = await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: view.id }), now);
      expect(page.counts[view.id], view.id).toBe(expected);
    }
    const first = await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "por-verificar" }), now);
    const second = await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "por-verificar", pagina: "2" }), now);
    expect(first).toMatchObject({ total: 30, page: 1, pageCount: 2, pageSize: ORDER_PAGE_SIZE });
    expect(first.ids).toHaveLength(25);
    expect(second.ids).toHaveLength(5);
    expect(new Set([...first.ids, ...second.ids]).size).toBe(30);
    const beyond = await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "por-verificar", pagina: "9" }), now);
    expect(beyond).toMatchObject({ page: 2, ids: second.ids });
  });

  it("canal y fecha van en la consulta", async () => {
    const store = fixture!.store.id;
    const pos = await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "todos", canal: "presencial" }));
    expect(pos.total).toBe(5);
    expect(pos.counts["por-verificar"]).toBe(0);
    const now = new Date();
    const range = getOrderDateRange({ kind: "7dias" }, now)!;
    const all = await testPrisma.order.findMany({ where: { storeId: store }, select: { createdAt: true } });
    const expected = all.filter((row) => row.createdAt >= range.start && row.createdAt <= range.end).length;
    const week = await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "todos", fecha: "7dias" }), now);
    expect(week.total).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    expect(expected).toBeLessThan(40);
  });

  it("busca por número, clienta, teléfono y nombre de producto", async () => {
    const store = fixture!.store.id;
    expect((await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "todos", q: "lapicero" }))).total).toBe(1);
    expect((await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "todos", q: "buscada rara" }))).total).toBe(2);
    expect((await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "todos", q: "ORD-LST-001" }))).total).toBe(1);
    expect((await listOrderPage(testPrisma, store, parseOrderListQuery({ vista: "todos", q: "zzz-nada" }))).total).toBe(0);
  });

  it("la página trae solo sus filas, con una sola foto por producto, y la cuenta de solo lectura sin contacto", async () => {
    const { getOrders } = await import("@/app/(dashboard)/[storeId]/(routes)/pedidos/server/get-orders");
    const result = await getOrders(fixture!.store.id, parseOrderListQuery({ vista: "todos" }));
    expect(result.orders).toHaveLength(25);
    expect(result.totalOrders).toBe(40);
    expect(result.orders.every((order) => order.orderItems.every((item) => (item.product?.images.length ?? 0) <= 1))).toBe(true);
    expect(result.orders[0].orderItems[0].product?.images[0]?.url).toBe("https://images.test/principal.jpg");
    expect(new Date(result.orders[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(result.orders[24].createdAt).getTime());
  });
});
