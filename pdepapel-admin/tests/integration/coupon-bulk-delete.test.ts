import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DELETE } from "@/app/api/[storeId]/coupons/route";
import { NextRequest } from "next/server";

import { testPrisma } from "./helpers/database";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));

/**
 * Borrar en lote no puede fallar entero porque un cupón ya tenga pedidos:
 * los sin pedidos se borran y los otros vuelven en `skipped` con su cuenta.
 */
describe("bulk coupon delete", () => {
  const suffix = randomUUID().slice(0, 8);
  let storeId = "";

  beforeAll(async () => {
    await testPrisma.$connect();
    const store = await testPrisma.store.create({ data: { name: `Cupones ${suffix}`, userId: `owner-${suffix}` } });
    storeId = store.id;
    session.userId = store.userId;
  });

  afterAll(async () => {
    await testPrisma.order.deleteMany({ where: { storeId } });
    await testPrisma.coupon.deleteMany({ where: { storeId } });
    await testPrisma.store.delete({ where: { id: storeId } });
    await testPrisma.$disconnect();
  });

  const coupon = (code: string) =>
    testPrisma.coupon.create({
      data: {
        storeId,
        code: `${code}-${suffix}`,
        type: "FIXED",
        amount: 5000,
        maxUses: 1,
        isActive: true,
        startDate: new Date(Date.now() - 86_400_000),
        endDate: new Date(Date.now() + 30 * 86_400_000),
      },
    });

  it("deletes the unused coupons and skips the one with an order", async () => {
    const libre = await coupon("LIBRE");
    const usado = await coupon("USADO");
    const otro = await coupon("OTRO");
    await testPrisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-${suffix}`,
        status: "PAID",
        type: "STANDARD",
        fullName: "Clienta",
        phone: "573001112233",
        email: `clienta-${suffix}@example.com`,
        subtotal: 15000,
        total: 10000,
        couponId: usado.id,
        couponDiscount: 5000,
      },
    });

    const response = await DELETE(
      new NextRequest(`https://admin.test/api/${storeId}/coupons`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [libre.id, usado.id, otro.id] }),
      }),
      { params: { storeId } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 2, skipped: [{ id: usado.id, code: usado.code, ordersCount: 1 }] });
    const remaining = await testPrisma.coupon.findMany({ where: { storeId }, select: { id: true } });
    expect(remaining.map((row) => row.id)).toEqual([usado.id]);
  });
});
