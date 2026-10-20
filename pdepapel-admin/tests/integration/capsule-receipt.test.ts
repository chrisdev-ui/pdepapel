import { CapsuleSlipKind, OrderStatus } from "@prisma/client";
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

import { drawCapsuleSlip, finishCapsuleDraw, printCapsuleSlips } from "@/lib/capsule-slips";
import { buildOrderEmails, loadOrderForEmail } from "@/lib/email";

import { assertNoForbiddenKeys } from "../helpers/forbidden-keys";

import { capsuleCheckoutBody, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Lo que la clienta ve de su pack: el recibo trae el pack, el regalo y, con el
 * sorteo cerrado, lo que salió; nunca costos, códigos ni topes, ni para quien
 * abre el enlace ni para la clienta con sesión. El correo explica que se abren
 * las cápsulas y se envían los productos, sin cifras de lo que «vale».
 */
let f: InventoryFixture | undefined;

const request = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

async function paidPack(packSize: number, userId: string | null = null) {
  session.userId = userId;
  const { POST } = await import("@/app/api/[storeId]/checkout/route");
  const response = await POST(request("POST", capsuleCheckoutBody(editionProductId!, packSize, userId ? { guestId: null } : {})), { params: { storeId: f!.store.id } });
  expect(response.status).toBe(200);
  const order = await testPrisma.order.findUniqueOrThrow({ where: { id: ((await response.json()) as { order: { id: string } }).order.id } });
  session.userId = null;
  const { POST: bold } = await import("@/app/api/webhook/bold/route");
  await bold(request("POST", { type: "SALE_APPROVED", data: { reference: order.orderNumber, payment_id: `B-${randomUUID().slice(0, 6)}`, amount: { total: order.total, currency: "COP" } } }, { "x-bold-signature": "firma" }));
  return order;
}

async function receipt(orderId: string) {
  const { GET } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  const response = await GET(request("GET"), { params: { storeId: f!.store.id, orderId } });
  expect(response.status).toBe(200);
  return response.json();
}

let editionProductId: string | undefined;

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

describe("el pack en el recibo y en el correo", () => {
  it("antes del sorteo: pack y regalo; después: lo que salió; sin costos ni códigos para quien abre el enlace", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    editionProductId = editionProduct.id;
    const order = await paidPack(10);

    const before = await receipt(order.id);
    expect(before).toMatchObject({ masked: true, capsule: { editionName: "Escritorio", editionNumber: 7, packSize: 10, giftLabel: "1 regalo sorpresa", drawCompleted: false, products: [] } });
    assertNoForbiddenKeys(before, "linkHolder");

    const regalo = await testPrisma.product.create({
      data: { name: "Sticker regalo", slug: `sticker-${randomUUID().slice(0, 6)}`, sku: `REG-${randomUUID().slice(0, 6)}`, description: "Regalo", stock: 1, price: 3000, acqPrice: 1500, storeId: f.store.id, categoryId: f.category.id, colorId: f.component.colorId, sizeId: f.component.sizeId, designId: f.component.designId },
    });
    await printCapsuleSlips({ storeId: f.store.id, editionId: edition.id, kind: CapsuleSlipKind.GIFT, items: [{ productId: regalo.id, quantity: 1 }], userId: "paula" });
    const slips = await testPrisma.capsuleSlip.findMany({ where: { editionId: edition.id, kind: CapsuleSlipKind.SLIP }, take: 10, orderBy: { code: "asc" } });
    const gift = await testPrisma.capsuleSlip.findFirstOrThrow({ where: { editionId: edition.id, kind: CapsuleSlipKind.GIFT } });
    for (const slip of [...slips, gift]) await drawCapsuleSlip({ storeId: f.store.id, orderId: order.id, code: slip.code, userId: "paula" });
    // Sacados pero sin cerrar: todavía no se muestran.
    await expect(receipt(order.id)).resolves.toMatchObject({ capsule: { drawCompleted: false, products: [] } });
    await finishCapsuleDraw({ storeId: f.store.id, orderId: order.id });

    const after = await receipt(order.id);
    expect(after.capsule.drawCompleted).toBe(true);
    expect(after.capsule.products).toHaveLength(11);
    expect(after.capsule.products.filter((row: { gift: boolean }) => row.gift)).toEqual([{ name: "Sticker regalo", gift: true }]);
    assertNoForbiddenKeys(after, "linkHolder");
    const text = JSON.stringify(after);
    for (const key of ["unitCost", "provisionalCost", "realCost", "giftMaxCost", "boxReserveCost", "costBand", "slotNumber", "editionId"]) expect(text).not.toContain(key);
    for (const slip of slips) expect(text).not.toContain(slip.code);
  });

  it("la clienta con sesión ve lo mismo del pack, sin costos", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f);
    editionProductId = editionProduct.id;
    const order = await paidPack(5, "user_clienta_capsulas");
    session.userId = "user_clienta_capsulas";
    const own = await receipt(order.id);
    expect(own).toMatchObject({ masked: false, capsule: { packSize: 5, giftLabel: null, drawCompleted: false } });
    assertNoForbiddenKeys(own, "owner");
    for (const key of ["unitCost", "provisionalCost", "realCost", "giftMaxCost", "totalProductCost", "netProfit"]) expect(JSON.stringify(own)).not.toContain(key);
  });

  it("el correo explica que abrimos las cápsulas y enviamos los productos, con el regalo", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f);
    editionProductId = editionProduct.id;
    const order = await paidPack(10);
    const loaded = await loadOrderForEmail(order.id);
    const { customer } = buildOrderEmails(loaded!, OrderStatus.PAID);
    expect(customer!.text).toContain("Abriremos tus cápsulas, te contamos qué salió y te enviamos tus productos");
    expect(customer!.text).toContain("Tu pack trae 1 regalo sorpresa");
    expect(customer!.text).not.toMatch(/lucky/i);
    const pending = buildOrderEmails(loaded!, OrderStatus.PENDING).customer!;
    expect(pending.text).toContain("Cuando se confirme el pago, abriremos tus cápsulas");
  });
});
