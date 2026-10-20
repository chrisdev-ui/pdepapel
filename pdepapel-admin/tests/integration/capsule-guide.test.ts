import { CapsuleSlipKind } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  background: [] as Promise<unknown>[],
  createShipment: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null, sessionClaims: {} }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/background", () => ({
  runInBackground: (_label: string, task: () => Promise<unknown>) => {
    mocks.background.push(task());
  },
}));
vi.mock("@/lib/envioclick", () => ({ envioClickClient: { createShipment: mocks.createShipment } }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/bold", () => ({
  generateBoldCheckoutData: (order: { id: string }) => ({ orderId: order.id, integritySignature: "sig" }),
  getBoldWebhookSecretKey: () => "secret",
  verifyBoldWebhookSignature: () => true,
}));
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

import { completeCapsuleDraw } from "@/lib/capsule-orders";
import { drawCapsuleSlip } from "@/lib/capsule-slips";
import { createGuideForOrder } from "@/lib/shipping-helpers";

import { capsuleCheckoutBody, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Cerrar el sorteo deja el pedido listo para salir: la guía se compra sola,
 * en segundo plano, con la caja sugerida por lo que salió y el peso del peor
 * caso cotizado. Antes de cerrar, la guía se niega.
 */
let f: InventoryFixture | undefined;

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com", ...headers }, body: JSON.stringify(body) });

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  mocks.background.length = 0;
  mocks.createShipment.mockReset();
  if (f) {
    await testPrisma.shipping.updateMany({ where: { storeId: f.store.id }, data: { boxId: null } });
    await testPrisma.box.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("guía de un pedido de cápsulas", () => {
  it("se niega con el sorteo abierto y se compra sola al cerrarlo, con la caja sugerida", async () => {
    f = await createInventoryFixture();
    for (const [type, side] of [["S", 15], ["M", 25], ["L", 35]] as const) {
      await testPrisma.box.create({ data: { storeId: f.store.id, name: `Caja ${type}`, type, width: side, height: side, length: side, isDefault: true } });
    }
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    const created = await POST(request(capsuleCheckoutBody(editionProduct.id, 5)), { params: { storeId: f.store.id } });
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: ((await created.json()) as { order: { id: string } }).order.id } });
    const { POST: bold } = await import("@/app/api/webhook/bold/route");
    await bold(request({ type: "SALE_APPROVED", data: { reference: order.orderNumber, payment_id: `B-${randomUUID().slice(0, 6)}`, amount: { total: order.total, currency: "COP" } } }, { "x-bold-signature": "firma" }));
    await testPrisma.shipping.update({ where: { orderId: order.id }, data: { envioClickIdRate: 777 } });

    await expect(createGuideForOrder(order.id, f.store.id)).rejects.toMatchObject({ statusCode: 409 });
    expect(mocks.createShipment).not.toHaveBeenCalled();

    mocks.createShipment.mockResolvedValue({ data: { idOrder: 9001, tracker: "TRK-1", url: "https://envioclick.test/g", guide: "", requestPickup: false, external_order_id: "EXT-1", origin: {}, destination: {} } });
    const slips = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 5, orderBy: { code: "asc" } });
    for (const slip of slips) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });
    const closed = await completeCapsuleDraw({ storeId: f.store.id, orderId: order.id });
    expect(closed).toMatchObject({ guideQueued: true });
    await Promise.all(mocks.background);

    expect(mocks.createShipment).toHaveBeenCalledTimes(1);
    const params = mocks.createShipment.mock.calls[0][0];
    const suggested = await testPrisma.capsuleOrder.findUniqueOrThrow({ where: { orderId: order.id } });
    const box = await testPrisma.box.findFirstOrThrow({ where: { storeId: f.store.id, type: suggested.suggestedBox! } });
    expect(params).toMatchObject({ idRate: 777, myShipmentReference: order.orderNumber });
    expect(params.packages[0]).toMatchObject({ width: box.width, height: box.height, length: box.length });
    expect(params.packages[0].weight).toBeGreaterThanOrEqual(1);
    await expect(testPrisma.shipping.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ envioClickIdOrder: 9001, trackingCode: "TRK-1" });
  });

  it("sin tarifa de EnvioClick (envío propio) no intenta guía", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const { POST } = await import("@/app/api/[storeId]/checkout/route");
    const created = await POST(request(capsuleCheckoutBody(editionProduct.id, 5)), { params: { storeId: f.store.id } });
    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: ((await created.json()) as { order: { id: string } }).order.id } });
    const { POST: bold } = await import("@/app/api/webhook/bold/route");
    await bold(request({ type: "SALE_APPROVED", data: { reference: order.orderNumber, payment_id: `B-${randomUUID().slice(0, 6)}`, amount: { total: order.total, currency: "COP" } } }, { "x-bold-signature": "firma" }));
    const slips = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 5, orderBy: { code: "asc" } });
    for (const slip of slips) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });
    await expect(completeCapsuleDraw({ storeId: f.store.id, orderId: order.id })).resolves.toMatchObject({ guideQueued: false });
    await Promise.all(mocks.background);
    expect(mocks.createShipment).not.toHaveBeenCalled();
  });
});
