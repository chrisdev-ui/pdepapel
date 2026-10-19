import { randomUUID } from "node:crypto";
import { OrderStatus, OrderType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: {} }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("next/headers", () => ({ headers: () => new Map() }));

import { getOrder } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/server/get-order";

/**
 * `getOrder` buscaba el pedido solo por id: con acceso a la tienda A se
 * abría `/A/pedidos/<id de un pedido de B>`.
 */
let storeA: InventoryFixture | undefined;
let storeB: InventoryFixture | undefined;
let orderOfB = "";

beforeAll(async () => {
  await testPrisma.$connect();
  storeA = await createInventoryFixture();
  storeB = await createInventoryFixture();
  orderOfB = (
    await testPrisma.order.create({
      data: { storeId: storeB.store.id, orderNumber: `ORD-B-${randomUUID().slice(0, 8)}`, status: OrderStatus.PENDING, type: OrderType.STANDARD, fullName: "Clienta B", subtotal: 1, total: 1 } as never,
    })
  ).id;
});

afterAll(async () => {
  await testPrisma.order.deleteMany({ where: { id: orderOfB } });
  for (const fixture of [storeA, storeB]) if (fixture) await deleteInventoryFixture(fixture);
  await testPrisma.$disconnect();
});

describe("getOrder: un pedido solo se abre desde su tienda", () => {
  it("la dueña de A no ve el pedido de B desde la URL de A", async () => {
    session.userId = storeA!.store.userId;
    const result = await getOrder(orderOfB, storeA!.store.id);
    expect(result.order).toBeNull();
    assertNoForbiddenKeys(result.order, "viewer");
  });

  it("la dueña de B sí lo ve desde su tienda", async () => {
    session.userId = storeB!.store.userId;
    const { order } = await getOrder(orderOfB, storeB!.store.id);
    expect(order?.id).toBe(orderOfB);
  });
});
