import { CapsuleCostStatus, CapsuleDailySlotStatus, CapsuleSlipKind, GiftCardMovementType, OrderStatus, OrderType } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
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

import { finishCapsuleDraw, drawCapsuleSlip, printCapsuleSlips } from "@/lib/capsule-slips";
import { generateGiftCardCode, giftCardCodeLast4, hashGiftCardCode, normalizeGiftCardCode } from "@/lib/gift-card-codes";

import { capsuleCheckoutBody, capsuleCustomer, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Pagar un pedido de cápsulas por cualquier camino congela el costo
 * provisional (media de los papeles × pack + el tope del regalo), lo suma a
 * las finanzas del pedido y confirma su cupo del día. Una sola vez. Con eso,
 * el sorteo puede cerrarse con el costo real.
 */
let f: InventoryFixture | undefined;
const WOMPI_EVENTS_KEY = process.env.WOMPI_EVENTS_KEY ?? "test-stub";

const request = (method: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com", ...headers }, body: JSON.stringify(body) });

async function checkout(productId: string, packSize: number, extra: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/[storeId]/checkout/route");
  const response = await POST(request("POST", capsuleCheckoutBody(productId, packSize, extra)), { params: { storeId: f!.store.id } });
  expect(response.status).toBe(200);
  const data = (await response.json()) as { id?: string; order?: { id: string } };
  const id = data.order?.id ?? data.id;
  // Wompi responde solo la URL de pago: el pedido es el último de la tienda.
  return id ? testPrisma.order.findUniqueOrThrow({ where: { id } }) : testPrisma.order.findFirstOrThrow({ where: { storeId: f!.store.id }, orderBy: { createdAt: "desc" } });
}

async function payWithBold(order: { orderNumber: string; total: number }, paymentId = `BOLD-${randomUUID().slice(0, 8)}`) {
  const { POST } = await import("@/app/api/webhook/bold/route");
  return POST(
    request("POST", { type: "SALE_APPROVED", data: { reference: order.orderNumber, payment_id: paymentId, amount: { total: order.total, currency: "COP" } } }, { "x-bold-signature": "firma" }),
  );
}

async function payWithWompi(order: { id: string; total: number }) {
  const transaction = { id: `WOMPI-${randomUUID().slice(0, 8)}`, status: "APPROVED", reference: order.id, amount_in_cents: Math.round(order.total * 100), currency: "COP" };
  const properties = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const timestamp = Math.floor(Date.now() / 1000);
  const checksum = createHash("sha256").update(`${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${WOMPI_EVENTS_KEY}`).digest("hex");
  const { POST } = await import("@/app/api/webhook/wompi/route");
  return POST(request("POST", { event: "transaction.updated", data: { transaction }, signature: { properties, checksum }, timestamp }));
}

const capsuleState = async (orderId: string) => ({
  order: await testPrisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, totalProductCost: true, netProfit: true, paidAt: true } }),
  capsule: await testPrisma.capsuleOrder.findUniqueOrThrow({ where: { orderId }, select: { provisionalCost: true, costStatus: true } }),
  slot: await testPrisma.capsuleDailySlot.findUnique({ where: { orderId }, select: { status: true, expiresAt: true, slotNumber: true } }),
});

/** 10 papeles a 4.000 + el tope del regalo (2.000). */
const PROVISIONAL_10 = 42000;

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  session.userId = null;
  if (f) {
    await testPrisma.giftCardMovement.deleteMany({ where: { storeId: f.store.id } });
    await testPrisma.order.updateMany({ where: { storeId: f.store.id }, data: { giftCardId: null } });
    await testPrisma.giftCard.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("pagar un pack de cápsulas", () => {
  it("Bold: congela el provisional, lo suma al costo, confirma el cupo; el reintento no suma dos veces; el sorteo cierra con el costo real", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const order = await checkout(editionProduct.id, 10);

    expect((await payWithBold(order, "BOLD-1")).status).toBe(200);
    const paid = await capsuleState(order.id);
    expect(paid.order.status).toBe(OrderStatus.PAID);
    expect(paid.capsule).toEqual({ provisionalCost: PROVISIONAL_10, costStatus: CapsuleCostStatus.PROVISIONAL });
    expect(paid.order.totalProductCost).toBe(PROVISIONAL_10);
    expect(paid.slot).toMatchObject({ status: CapsuleDailySlotStatus.CONFIRMED, expiresAt: null });

    await payWithBold(order, "BOLD-1");
    const replayed = await capsuleState(order.id);
    expect(replayed.order.totalProductCost).toBe(PROVISIONAL_10);
    expect(replayed.order.netProfit).toBe(paid.order.netProfit);

    // Sacar los 10 papeles y el regalo, y cerrar: el costo real reemplaza al provisional.
    const regalo = await testPrisma.product.create({
      data: { name: "Sticker regalo", slug: `sticker-regalo-${randomUUID().slice(0, 6)}`, sku: `REG-${randomUUID().slice(0, 6)}`, description: "Regalo", stock: 2, price: 3000, acqPrice: 1500, storeId: f.store.id, categoryId: f.category.id, colorId: f.component.colorId, sizeId: f.component.sizeId, designId: f.component.designId },
    });
    await printCapsuleSlips({ storeId: f.store.id, editionId: edition.id, kind: CapsuleSlipKind.GIFT, items: [{ productId: regalo.id, quantity: 1 }], userId: "paula" });
    const slips = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 10, orderBy: { code: "asc" } });
    const gift = await testPrisma.capsuleSlip.findFirstOrThrow({ where: { editionId: edition.id, kind: CapsuleSlipKind.GIFT } });
    for (const slip of [...slips, gift]) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });
    await expect(finishCapsuleDraw({ storeId: f.store.id, orderId: order.id })).resolves.toMatchObject({ provisionalCost: PROVISIONAL_10, realCost: 41500, delta: -500 });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ totalProductCost: 41500 });
  });

  it("Wompi: lo mismo", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f);
    const order = await checkout(editionProduct.id, 10, { payment: { method: "Wompi" } });
    expect((await payWithWompi(order)).status).toBe(200);
    const paid = await capsuleState(order.id);
    expect(paid).toMatchObject({ order: { status: OrderStatus.PAID, totalProductCost: PROVISIONAL_10 }, capsule: { provisionalCost: PROVISIONAL_10 }, slot: { status: CapsuleDailySlotStatus.CONFIRMED } });
  });

  it("«Marcar pagado» uno, en lote y un pedido del panel que nace pagado", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f);
    // Los pedidos los hace la clienta; la dueña los marca pagados.
    const single = await checkout(editionProduct.id, 5);
    const bulk = await checkout(editionProduct.id, 5);
    session.userId = f.store.userId;
    const { PATCH: patchOne } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const one = await patchOne(request("PATCH", { status: OrderStatus.PAID, expectedStatus: single.status }), { params: { storeId: f.store.id, orderId: single.id } });
    expect(one.status).toBe(200);
    // 5 papeles a 4.000, sin regalo.
    await expect(capsuleState(single.id)).resolves.toMatchObject({ order: { status: OrderStatus.PAID, totalProductCost: 20000 }, capsule: { provisionalCost: 20000 }, slot: { status: CapsuleDailySlotStatus.CONFIRMED } });

    const { PATCH: patchMany, POST } = await import("@/app/api/[storeId]/orders/route");
    expect((await patchMany(request("PATCH", { ids: [bulk.id], status: OrderStatus.PAID }), { params: { storeId: f.store.id } })).status).toBe(200);
    await expect(capsuleState(bulk.id)).resolves.toMatchObject({ order: { status: OrderStatus.PAID }, capsule: { provisionalCost: 20000 }, slot: { status: CapsuleDailySlotStatus.CONFIRMED } });

    const created = await POST(request("POST", { ...capsuleCheckoutBody(editionProduct.id, 5), status: OrderStatus.PAID, type: OrderType.STANDARD }), { params: { storeId: f.store.id } });
    expect(created.status).toBe(200);
    const createdId = ((await created.json()) as { id: string }).id;
    await expect(capsuleState(createdId)).resolves.toMatchObject({ order: { status: OrderStatus.PAID, totalProductCost: 20000 }, capsule: { provisionalCost: 20000 }, slot: { status: CapsuleDailySlotStatus.CONFIRMED } });
  });

  it("tarjeta de regalo que cubre todo el pack: nace pagado con el provisional y el cupo confirmado", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f);
    const code = generateGiftCardCode();
    const canonical = normalizeGiftCardCode(code) as string;
    const purchase = await testPrisma.order.create({
      data: { storeId: f.store.id, orderNumber: `ORD-GC-${randomUUID().slice(0, 8)}`, status: OrderStatus.PAID, paidAt: new Date(), type: OrderType.GIFT_CARD, ...capsuleCustomer, subtotal: 200000, total: 200000 },
    });
    const card = await testPrisma.giftCard.create({
      data: { storeId: f.store.id, codeHash: hashGiftCardCode(canonical), codeLast4: giftCardCodeLast4(canonical), initialAmount: 200000, balance: 200000, purchaseOrderId: purchase.id, buyerEmail: capsuleCustomer.email },
    });
    await testPrisma.giftCardMovement.create({ data: { storeId: f.store.id, giftCardId: card.id, orderId: purchase.id, type: GiftCardMovementType.ISSUED, amount: 200000, balanceAfter: 200000, idempotencyKey: `issue:${purchase.id}` } });

    const order = await checkout(editionProduct.id, 10, { giftCardCode: code });
    await expect(capsuleState(order.id)).resolves.toMatchObject({ order: { status: OrderStatus.PAID, totalProductCost: PROVISIONAL_10 }, capsule: { provisionalCost: PROVISIONAL_10 }, slot: { status: CapsuleDailySlotStatus.CONFIRMED } });
  });

  it("un pago que llega después de que su apartado venció y otro tomó el cupo gana igual, con un cupo de más", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    const late = await checkout(editionProduct.id, 5);
    await testPrisma.capsuleDailySlot.update({ where: { orderId: late.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const other = await checkout(editionProduct.id, 5);
    await expect(testPrisma.capsuleDailySlot.findUnique({ where: { orderId: late.id } })).resolves.toBeNull();

    expect((await payWithBold(late)).status).toBe(200);
    await expect(capsuleState(late.id)).resolves.toMatchObject({ order: { status: OrderStatus.PAID }, slot: { status: CapsuleDailySlotStatus.CONFIRMED, slotNumber: 2 } });
    await expect(testPrisma.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: other.id } })).resolves.toMatchObject({ slotNumber: 1, status: CapsuleDailySlotStatus.HELD });
  });
});
