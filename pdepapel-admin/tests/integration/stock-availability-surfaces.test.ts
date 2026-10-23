import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderType, PaymentMethod } from "@prisma/client";

import { recalculateKitStock, validateStockAvailability } from "@/lib/inventory";
import { createPointOfSaleSale } from "@/lib/point-of-sale";
import { buildGoogleMerchantFeed, getGoogleMerchantFeedProductArgs } from "@/lib/google-merchant-feed";
import { buildMetaCatalogFeed } from "@/lib/meta-catalog-feed";
import { answerAboutProduct } from "@/lib/whatsapp/bot-products";
import { countInStockMatches } from "@/lib/whatsapp/shadow/search";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Apartados, lote 1: lo que se puede vender es `stock - reservedUnits` en
 * cada superficie que vende. El componente del fixture arranca con 6 en bodega
 * y aquí se le apartan 2 (o las 6) sin tocar el stock físico.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/bold", () => ({ generateBoldCheckoutData: (order: { id: string }) => ({ orderId: order.id, integritySignature: "sig" }) }));
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

const get = (url: string) => new Request(url, { headers: { Origin: "https://papeleriapdepapel.com" } });
const post = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

const reserve = (productId: string, units: number) => testPrisma.product.update({ where: { id: productId }, data: { reservedUnits: units } });

const storeBody = (f: InventoryFixture, quantity: number) => ({
  fullName: "Luisa Sánchez",
  phone: "+573009999999",
  email: "luisa@prueba.test",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  department: "Antioquia",
  daneCode: "05001000",
  guestId: `guest_${randomUUID()}`,
  type: OrderType.STANDARD,
  orderItems: [{ productId: f.component.id, quantity }],
  payment: { method: PaymentMethod.BankTransfer },
  shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
  subtotal: 10000 * quantity,
  total: 10000 * quantity + 5000,
});

describe("lo apartado no se vende en ninguna superficie (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("tienda: el stock público sale neto en el carrito, el listado y la ficha, y el contador nunca se publica", async () => {
    fixture = await createInventoryFixture();
    await reserve(fixture.component.id, 2);
    await recalculateKitStock(testPrisma, [fixture.kit.id]);
    const { GET } = await import("@/app/api/[storeId]/products/route");
    const params = { storeId: fixture.store.id };

    const live = await (await GET(get(`http://admin.test/api/x/products?ids=${fixture.component.id},${fixture.kit.id}`), { params })).json();
    const byId = new Map((live as { id: string; stock: number }[]).map((row) => [row.id, row]));
    expect(byId.get(fixture.component.id)).toMatchObject({ stock: 4 });
    // 6 en bodega, 2 apartados, 2 por kit: se arman 3 kits pero se venden 2.
    expect(byId.get(fixture.kit.id)).toMatchObject({ stock: 2 });

    const listing = await (await GET(get("http://admin.test/api/x/products?skipCache=true"), { params })).json();
    const rows = (listing.products ?? listing) as Record<string, unknown>[];
    expect(rows.find((row) => row.id === fixture!.component.id)).toMatchObject({ stock: 4 });
    expect(rows.find((row) => row.id === fixture!.kit.id)).toMatchObject({ stock: 2 });

    const { GET: detail } = await import("@/app/api/[storeId]/products/[productId]/route");
    const kitPage = await (await detail(get("http://admin.test/api/x/products/k?scope=storefront"), { params: { ...params, productId: fixture.kit.id } })).json();
    expect(kitPage.stock).toBe(2);
    expect(kitPage.kitComponents[0].component.stock).toBe(4);

    for (const payload of [live, listing, kitPage]) expect(JSON.stringify(payload)).not.toContain("reservedUnits");

    session.userId = fixture.store.userId;
    const owner = await (await detail(get("http://admin.test/api/x/products/p"), { params: { ...params, productId: fixture.component.id } })).json();
    expect(owner).toMatchObject({ stock: 6, reservedUnits: 2 });
  });

  it("checkout, transferencia de la tienda y pedido del panel: rechazan lo apartado y aceptan lo disponible", async () => {
    fixture = await createInventoryFixture();
    await reserve(fixture.component.id, 2);
    const params = { params: { storeId: fixture.store.id } };
    const { POST: checkout } = await import("@/app/api/[storeId]/checkout/route");
    const { POST: orders } = await import("@/app/api/[storeId]/orders/route");

    const tooMany = await checkout(post(storeBody(fixture, 5)), params);
    expect(tooMany.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(await tooMany.json())).toContain("\"available\":4");
    expect((await checkout(post(storeBody(fixture, 4)), params)).status).toBe(200);

    // Transferencia y contra entrega de la tienda llegan a /orders sin `status`.
    expect((await orders(post(storeBody(fixture, 5)), params)).status).toBeGreaterThanOrEqual(400);
    expect((await orders(post(storeBody(fixture, 4)), params)).status).toBe(200);

    // Pedido del panel (pendiente): la misma regla.
    session.userId = fixture.store.userId;
    const panelOrder = (quantity: number) => post({ ...storeBody(fixture!, quantity), guestId: null, status: "PENDING" });
    expect((await orders(panelOrder(5), params)).status).toBeGreaterThanOrEqual(400);
    expect((await orders(panelOrder(4), params)).status).toBe(200);
    await expect(validateStockAvailability(testPrisma, [{ productId: fixture.component.id, quantity: 4 }])).resolves.toBeUndefined();
    await expect(validateStockAvailability(testPrisma, [{ productId: fixture.kit.id, quantity: 3 }])).rejects.toMatchObject({ statusCode: expect.any(Number) });
  });

  it("punto de venta: vende hasta lo disponible y dos ventas a la vez no se llevan lo apartado", async () => {
    fixture = await createInventoryFixture();
    await reserve(fixture.component.id, 2);
    const sale = (key: string, quantity: number) =>
      createPointOfSaleSale({
        storeId: fixture!.store.id,
        items: [{ productId: fixture!.component.id, quantity }],
        paymentMethod: PaymentMethod.CASH,
        idempotencyKey: key,
        userId: fixture!.store.userId,
      });

    await expect(sale(`pos-${randomUUID()}`, 5)).rejects.toMatchObject({ statusCode: 422 });
    const results = await Promise.allSettled([sale(`pos-${randomUUID()}`, 4), sale(`pos-${randomUUID()}`, 4)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);

    const after = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(after).toMatchObject({ stock: 2, reservedUnits: 2 });
  });

  it("bot y feeds: un producto con todo apartado sale agotado", async () => {
    fixture = await createInventoryFixture();
    await reserve(fixture.component.id, 6);

    const answer = await answerAboutProduct(fixture.store.id, fixture.component.id, "product.availability");
    const { PRODUCT_TEMPLATES } = await import("@/lib/whatsapp/bot-products");
    expect(answer?.text).toBe(PRODUCT_TEMPLATES["availability.one.no"](fixture.component.name));
    await expect(countInStockMatches(fixture.store.id, "Componente", null, { minTokens: 1 })).resolves.toBe(0);

    // Sin una foto que cargue, el producto no sale en el feed de Meta.
    const photo = await testPrisma.image.create({ data: { productId: fixture.component.id, url: "https://res.cloudinary.com/demo/image/upload/v1/componente.jpg", isMain: true } });
    const products = await testPrisma.product.findMany(getGoogleMerchantFeedProductArgs(fixture.store.id));
    const component = products.filter((product) => product.id === fixture!.component.id);
    expect(buildGoogleMerchantFeed(component).report.outOfStock).toBe(1);
    expect(buildMetaCatalogFeed(component).report.outOfStock).toBe(1);

    await reserve(fixture.component.id, 5);
    await expect(countInStockMatches(fixture.store.id, "Componente", null, { minTokens: 1 })).resolves.toBe(1);
    const again = await testPrisma.product.findMany(getGoogleMerchantFeedProductArgs(fixture.store.id));
    expect(buildGoogleMerchantFeed(again.filter((product) => product.id === fixture!.component.id)).report.outOfStock).toBe(0);
    await testPrisma.image.delete({ where: { id: photo.id } });
  });
});
