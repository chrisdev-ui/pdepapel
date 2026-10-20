import { CapsuleSlipKind, CapsuleSlipStatus, OrderStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
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
vi.mock("@/lib/bold", () => ({
  generateBoldCheckoutData: (order: { id: string }) => ({ orderId: order.id, integritySignature: "sig" }),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
}));
vi.mock("@/lib/utils", async (importOriginal) => ({ ...(await importOriginal<object>()), generateWompiPayment: vi.fn().mockResolvedValue("https://wompi.test/pago") }));
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

import { capsuleDayStatus } from "@/lib/capsule-day";
import { drawCapsuleSlip } from "@/lib/capsule-slips";
import prismadb from "@/lib/prismadb";

import { capsuleCheckoutBody, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Cancelar un pedido de cápsulas: el cupo del día vuelve (sin pagar, anulado,
 * cancelado o borrado), el producto de la edición recupera solo los papeles
 * que no alcanzaron a sacarse, y los sacados quedan DRAWN con el pedido.
 */
let f: InventoryFixture | undefined;

const request = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function checkout(productId: string, packSize: number) {
  const { POST } = await import("@/app/api/[storeId]/checkout/route");
  const response = await POST(request("POST", capsuleCheckoutBody(productId, packSize)), { params: { storeId: f!.store.id } });
  expect(response.status).toBe(200);
  const data = (await response.json()) as { order: { id: string } };
  return testPrisma.order.findUniqueOrThrow({ where: { id: data.order.id } });
}

async function bold(type: "SALE_APPROVED" | "VOID_APPROVED", order: { orderNumber: string; total: number }) {
  const { POST } = await import("@/app/api/webhook/bold/route");
  const response = await POST(
    request("POST", { type, data: { reference: order.orderNumber, payment_id: "BOLD-CANCEL-1", amount: { total: order.total, currency: "COP" } } }, { "x-bold-signature": "firma" }),
  );
  expect(response.status).toBe(200);
}

async function cancelFromPanel(order: { id: string }) {
  session.userId = f!.store.userId;
  const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  const current = await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } });
  const response = await PATCH(request("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: current.status }), { params: { storeId: f!.store.id, orderId: order.id } });
  session.userId = null;
  return response;
}

const dayLeft = async (edition: { dailyOrderCap: number; opensAtLocal: string }) => (await capsuleDayStatus(prismadb, f!.store.id, edition)).left;
const stockOf = async (productId: string) => (await testPrisma.product.findUniqueOrThrow({ where: { id: productId } })).stock;

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

describe("cancelar un pack de cápsulas", () => {
  it("sin pagar: cancelarlo devuelve el cupo del día", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    const order = await checkout(editionProduct.id, 5);
    await expect(dayLeft(edition)).resolves.toBe(0);
    expect((await cancelFromPanel(order)).status).toBe(200);
    await expect(dayLeft(edition)).resolves.toBe(1);
    // Y otra compra lo toma.
    await checkout(editionProduct.id, 5);
  });

  it("pagado y anulado por Bold antes del sorteo: vuelven los 10 papeles al producto de la edición y el cupo", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const order = await checkout(editionProduct.id, 10);
    await bold("SALE_APPROVED", order);
    await expect(stockOf(editionProduct.id)).resolves.toBe(30);
    await expect(dayLeft(edition)).resolves.toBe(4);

    await bold("VOID_APPROVED", order);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: OrderStatus.CANCELLED });
    await expect(stockOf(editionProduct.id)).resolves.toBe(40);
    await expect(dayLeft(edition)).resolves.toBe(5);
  });

  it("cancelado después de sacar 3 papeles: vuelven 7 al producto de la edición; los 3 quedan DRAWN con el pedido y sus productos fuera de bodega", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition, lapicero } = await createLiveCapsuleEdition(f);
    const order = await checkout(editionProduct.id, 10);
    await bold("SALE_APPROVED", order);
    const slips = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 3, orderBy: { code: "asc" } });
    for (const slip of slips) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });
    await expect(stockOf(lapicero.id)).resolves.toBe(37);

    expect((await cancelFromPanel(order)).status).toBe(200);
    await expect(stockOf(editionProduct.id)).resolves.toBe(37);
    await expect(testPrisma.capsuleSlip.count({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP, status: CapsuleSlipStatus.PRINTED } })).resolves.toBe(37);
    await expect(testPrisma.capsuleSlip.count({ where: { orderId: order.id, status: CapsuleSlipStatus.DRAWN } })).resolves.toBe(3);
    // Los productos sacados vuelven con una «Devolución» cuando lleguen, no solos.
    await expect(stockOf(lapicero.id)).resolves.toBe(37);
    const movement = await testPrisma.inventoryMovement.findFirstOrThrow({ where: { productId: editionProduct.id, referenceId: order.id, type: "ORDER_CANCELLED" } });
    expect(movement.quantity).toBe(7);
  });

  it("un pedido borrado libera su cupo", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    const order = await checkout(editionProduct.id, 5);
    await testPrisma.capsuleOrder.deleteMany({ where: { orderId: order.id } });
    await testPrisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await testPrisma.shipping.deleteMany({ where: { orderId: order.id } });
    await testPrisma.paymentDetails.deleteMany({ where: { orderId: order.id } });
    await testPrisma.order.delete({ where: { id: order.id } });
    await expect(dayLeft(edition)).resolves.toBe(1);
    await checkout(editionProduct.id, 5);
    await expect(testPrisma.capsuleDailySlot.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
  });
});
