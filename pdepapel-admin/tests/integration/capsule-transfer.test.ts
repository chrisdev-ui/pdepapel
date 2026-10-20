import { CapsuleDailySlotStatus, CapsuleSlipKind, OrderStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: {} }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));
vi.mock("@upstash/redis", () => {
  const client = { get: async () => null, set: async () => "OK", del: async () => 1, scan: async () => [0, []], incr: async () => 1, expire: async () => 1 };
  class Redis {
    static fromEnv() {
      return client;
    }
    get = client.get;
    set = client.set;
    del = client.del;
    scan = client.scan;
    incr = client.incr;
    expire = client.expire;
  }
  return { Redis };
});

import { CAPSULE_TRANSFER_HOLD_HOURS } from "@/lib/capsule-checkout";
import { capsuleDayStatus } from "@/lib/capsule-day";
import { listCapsuleQueue, listPendingTransferCapsuleOrders } from "@/lib/capsule-orders";
import { drawCapsuleSlip } from "@/lib/capsule-slips";
import prismadb from "@/lib/prismadb";

import { capsuleCheckoutBody, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Un pack pagado por transferencia (la ruta /orders de la tienda): el cupo
 * queda apartado 24 horas mientras Paula verifica; al marcarlo pagado se
 * confirma y entra a «Por sacar»; si nadie lo verifica a tiempo el cupo vuelve
 * a estar libre; y no se saca nada mientras el pago esté pendiente.
 */
let f: InventoryFixture | undefined;

/** Envío acordado por WhatsApp: no se cobra en el pedido, así que el total es el del pack. */
const transferBody = (productId: string, packSize: number) => {
  const body = capsuleCheckoutBody(productId, packSize, { payment: { method: "BankTransfer" }, shippingProvider: "MANUAL", shipping: { provider: "MANUAL", carrierName: "Acordar por WhatsApp", courier: "WhatsApp", cost: 0 } });
  return { ...body, total: body.subtotal };
};

const transferOrder = async (productId: string, packSize: number) => {
  const { POST } = await import("@/app/api/[storeId]/orders/route");
  const response = await POST(
    new Request("http://admin.test/x", {
      method: "POST",
      headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" },
      body: JSON.stringify(transferBody(productId, packSize)),
    }),
    { params: { storeId: f!.store.id } },
  );
  return response;
};

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  session.userId = null;
  if (f) await deleteInventoryFixture(f);
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("pack por transferencia", () => {
  it("aparta el cupo 24 horas, va aparte de «Por sacar», no se saca hasta pagarse y al marcarlo pagado se confirma", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const before = Date.now();
    const created = await transferOrder(editionProduct.id, 5);
    expect(created.status).toBe(200);
    const order = (await created.json()) as { id: string; status: string; total: number };
    expect(order).toMatchObject({ status: OrderStatus.PENDING, total: 64500 });

    const slot = await testPrisma.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(slot.status).toBe(CapsuleDailySlotStatus.HELD);
    expect(slot.expiresAt!.getTime() - before).toBeGreaterThanOrEqual((CAPSULE_TRANSFER_HOLD_HOURS * 60 - 1) * 60 * 1000);
    expect(slot.expiresAt!.getTime() - before).toBeLessThanOrEqual((CAPSULE_TRANSFER_HOLD_HOURS * 60 + 1) * 60 * 1000);

    await expect(listPendingTransferCapsuleOrders(f.store.id)).resolves.toEqual([expect.objectContaining({ orderId: order.id, packSize: 5, hasProof: false, holdUntil: slot.expiresAt })]);
    await expect(listCapsuleQueue(f.store.id)).resolves.toEqual([]);

    const [code] = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 1 });
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: code.code, userId: "paula" })).rejects.toMatchObject({ statusCode: 409 });

    session.userId = f.store.userId;
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const paid = await PATCH(
      new Request("http://admin.test/x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING }) }),
      { params: { storeId: f.store.id, orderId: order.id } },
    );
    expect(paid.status).toBe(200);
    await expect(testPrisma.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ status: CapsuleDailySlotStatus.CONFIRMED, expiresAt: null });
    await expect(testPrisma.capsuleOrder.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ provisionalCost: 20000 });
    await expect(listPendingTransferCapsuleOrders(f.store.id)).resolves.toEqual([]);
    await expect(listCapsuleQueue(f.store.id)).resolves.toEqual([expect.objectContaining({ orderId: order.id })]);
    await expect(drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: code.code, userId: "paula" })).resolves.toBeTruthy();
  });

  it("sin verificar a tiempo, el cupo vuelve a estar libre para otra compra", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    const first = (await (await transferOrder(editionProduct.id, 5)).json()) as { id: string };
    await expect(capsuleDayStatus(prismadb, f.store.id, edition)).resolves.toMatchObject({ left: 0 });
    // Vence el apartado de 24 horas.
    await testPrisma.capsuleDailySlot.update({ where: { orderId: first.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(capsuleDayStatus(prismadb, f.store.id, edition)).resolves.toMatchObject({ left: 1 });
    await expect(listPendingTransferCapsuleOrders(f.store.id)).resolves.toEqual([expect.objectContaining({ orderId: first.id })]);
    const second = await transferOrder(editionProduct.id, 5);
    expect(second.status).toBe(200);
    await expect(testPrisma.capsuleDailySlot.findUnique({ where: { orderId: first.id } })).resolves.toBeNull();
    await expect(listPendingTransferCapsuleOrders(f.store.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ orderId: first.id, holdUntil: null })]));
  });
});
