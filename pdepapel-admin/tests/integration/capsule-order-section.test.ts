import { CapsuleSlipKind } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId, sessionClaims: {} }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", async (importOriginal) => ({ ...(await importOriginal<object>()), sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
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

import { drawCapsuleSlip, finishCapsuleDraw } from "@/lib/capsule-slips";
import { getOrderCapsuleSection } from "@/lib/capsule-order-section";
import prismadb from "@/lib/prismadb";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";

import { capsuleCheckoutBody, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * La sección de cápsulas del pedido en el panel: la dueña ve pack, regalo,
 * permiso, cupo, lo que salió y el costo provisional y real; la cuenta de
 * solo lectura ve lo mismo sin costos ni topes.
 */
let f: InventoryFixture | undefined;

const request = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) await deleteInventoryFixture(f);
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("cápsulas en el pedido del panel", () => {
  it("la dueña ve el costo; solo lectura no; un pedido sin cápsulas no trae sección", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    const created = await POST(request("POST", capsuleCheckoutBody(editionProduct.id, 5, { capsuleVideoConsent: "PRIVATE" })), { params: { storeId: f.store.id } });
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: ((await created.json()) as { order: { id: string } }).order.id } });
    const { POST: bold } = await import("@/app/api/webhook/bold/route");
    await bold(request("POST", { type: "SALE_APPROVED", data: { reference: order.orderNumber, payment_id: `B-${randomUUID().slice(0, 6)}`, amount: { total: order.total, currency: "COP" } } }, { "x-bold-signature": "firma" }));
    const slips = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 5, orderBy: { code: "asc" } });
    for (const slip of slips) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });
    await finishCapsuleDraw({ storeId: f.store.id, orderId: order.id });

    const owner = await getOrderCapsuleSection(prismadb, { storeId: f.store.id, orderId: order.id, isViewer: false });
    expect(owner).toMatchObject({ editionNumber: 7, packSize: 5, videoConsent: "PRIVATE", provisionalCost: 20000, realCost: 20000, slipsDrawn: 5, slot: { number: 1, status: "CONFIRMED" } });
    expect(owner!.products).toHaveLength(5);

    const viewer = await getOrderCapsuleSection(prismadb, { storeId: f.store.id, orderId: order.id, isViewer: true });
    expect(viewer).toMatchObject({ packSize: 5, slipsDrawn: 5 });
    assertNoForbiddenKeys(viewer, "viewer");
    for (const key of ["provisionalCost", "realCost", "giftMaxCost", "costStatus", "unitCost"]) expect(JSON.stringify(viewer)).not.toContain(key);

    // Otra tienda no lo ve; un pedido normal no trae sección.
    await expect(getOrderCapsuleSection(prismadb, { storeId: "otra-tienda", orderId: order.id, isViewer: false })).resolves.toBeNull();
    const plain = await testPrisma.order.create({ data: { storeId: f.store.id, orderNumber: `ORD-${randomUUID().slice(0, 8)}`, fullName: "Ana", phone: "3000000000", address: "Calle 1", subtotal: 1, total: 1 } });
    await expect(getOrderCapsuleSection(prismadb, { storeId: f.store.id, orderId: plain.id, isViewer: false })).resolves.toBeNull();
  });
});
