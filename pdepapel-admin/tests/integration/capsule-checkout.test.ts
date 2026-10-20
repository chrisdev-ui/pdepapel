import { CapsuleDailySlotStatus, CapsuleEditionStatus, CapsuleVideoConsent } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
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

import { bogotaDate } from "@/lib/capsule-day";

import { capsuleCheckoutBody, createLiveCapsuleEdition } from "./helpers/capsules";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El checkout de un pack de cápsulas contra MySQL: el pack se valida en el
 * servidor (peldaño configurado, 25 % de lo que queda, edición a la venta con
 * la bandera, pago en línea, sin cupones, solo en su pedido), se cobra a su
 * peldaño y aparta un cupo del día que se asigna en fila.
 */
let f: InventoryFixture | undefined;

const post = async (route: "checkout" | "orders", body: Record<string, unknown>) => {
  const { POST } = route === "checkout" ? await import("@/app/api/[storeId]/checkout/route") : await import("@/app/api/[storeId]/orders/route");
  return POST(
    new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) }),
    { params: { storeId: f!.store.id } },
  );
};
const orderIdOf = async (response: Response) => {
  const data = (await response.json()) as { id?: string; order?: { id: string } };
  return data.order?.id ?? data.id!;
};

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  vi.unstubAllEnvs();
  session.userId = null;
  if (f) await deleteInventoryFixture(f);
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("checkout de un pack de cápsulas", () => {
  it("cobra el peldaño, guarda el pack, el regalo y el permiso del video, y aparta un cupo por la ventana de pago", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const before = Date.now();
    const response = await post("checkout", capsuleCheckoutBody(editionProduct.id, 10));
    expect(response.status).toBe(200);
    const orderId = await orderIdOf(response);

    const order = await testPrisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { orderItems: true } });
    expect(order).toMatchObject({ subtotal: 124900, total: 129900 });
    expect(order.orderItems).toEqual([expect.objectContaining({ productId: editionProduct.id, quantity: 10, price: 12490 })]);
    await expect(testPrisma.capsuleOrder.findUniqueOrThrow({ where: { orderId } })).resolves.toMatchObject({
      editionId: edition.id,
      packSize: 10,
      giftMaxCost: 2000,
      giftMaxItems: 1,
      videoConsent: CapsuleVideoConsent.PUBLIC_FIRST_NAME,
      provisionalCost: null,
    });
    const slot = await testPrisma.capsuleDailySlot.findUniqueOrThrow({ where: { orderId } });
    expect(slot).toMatchObject({ status: CapsuleDailySlotStatus.HELD, slotNumber: 1, bogotaDate: bogotaDate(new Date()) });
    expect(slot.expiresAt!.getTime() - before).toBeGreaterThanOrEqual(119 * 60 * 1000);
    expect(slot.expiresAt!.getTime() - before).toBeLessThanOrEqual(121 * 60 * 1000);
  });

  it("un pack no tiene envío gratis aunque pase el umbral de la tienda", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f);
    await testPrisma.store.update({ where: { id: f.store.id }, data: { freeShippingThreshold: 100000 } });
    const response = await post("checkout", capsuleCheckoutBody(editionProduct.id, 10));
    expect(response.status).toBe(200);
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: await orderIdOf(response) } })).resolves.toMatchObject({ subtotal: 124900, total: 129900 });
  });

  it("se niega sin la bandera, con la edición fuera de venta, contra entrega o transferencia, con cupón, mezclado o con un pack que no existe o no cabe", async () => {
    f = await createInventoryFixture();
    const { editionProduct, edition } = await createLiveCapsuleEdition(f);
    const expectRefused = async (route: "checkout" | "orders", body: Record<string, unknown>, status: number, text: RegExp) => {
      const response = await post(route, body);
      expect(response.status).toBe(status);
      expect(JSON.stringify(await response.json())).toMatch(text);
    };

    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 7), 400, /Elige un pack de 5, 10, 15, 20, 25, 30 cápsulas/);
    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 15), 409, /el pack más grande disponible es de 10/);
    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 5, { payment: { method: "COD" } }), 400, /no hay pago contra entrega/);
    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 5, { payment: { method: "BankTransfer" } }), 400, /se pagan en línea/);
    await expectRefused("orders", capsuleCheckoutBody(editionProduct.id, 5, { payment: { method: "BankTransfer" } }), 400, /se pagan en línea/);
    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 5, { couponCode: "BIENVENIDA" }), 409, /cupones y descuentos no aplican/);
    await expectRefused(
      "checkout",
      capsuleCheckoutBody(editionProduct.id, 5, { orderItems: [{ productId: editionProduct.id, quantity: 5 }, { productId: f.component.id, quantity: 1 }] }),
      409,
      /va solo en su pedido/,
    );

    vi.stubEnv("CAPSULE_SALES_TEST_OVERRIDE", "");
    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 5), 409, /todavía no está abierta/);
    vi.unstubAllEnvs();

    await testPrisma.capsuleEdition.update({ where: { id: edition.id }, data: { status: CapsuleEditionStatus.PREVIEW } });
    await expectRefused("checkout", capsuleCheckoutBody(editionProduct.id, 5), 409, /no está a la venta/);

    await expect(testPrisma.order.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
    await expect(testPrisma.capsuleDailySlot.count({ where: { storeId: f.store.id } })).resolves.toBe(0);
  });

  it("antes de la hora de apertura la tienda no vende; el panel sí", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f, { opensAtLocal: "23:59" });
    const refused = await post("checkout", capsuleCheckoutBody(editionProduct.id, 5));
    expect(refused.status).toBe(409);
    expect(JSON.stringify(await refused.json())).toMatch(/abren a las 11:59 p. m./);
    session.userId = f.store.userId;
    const panel = await post("orders", { ...capsuleCheckoutBody(editionProduct.id, 5), payment: { method: "Bold" } });
    expect(panel.status).toBe(200);
  });
});

describe("cupos del día", () => {
  it("con el tope lleno se niega; un apartado vencido se libera; la dueña sube el tope del día", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    const first = await post("checkout", capsuleCheckoutBody(editionProduct.id, 5));
    expect(first.status).toBe(200);
    const firstId = await orderIdOf(first);

    const full = await post("checkout", capsuleCheckoutBody(editionProduct.id, 5));
    expect(full.status).toBe(409);
    expect(JSON.stringify(await full.json())).toMatch(/Hoy ya no quedan cupos de cápsulas. Vuelve mañana a las 12:00 a. m./);

    session.userId = f.store.userId;
    const panelFull = await post("orders", capsuleCheckoutBody(editionProduct.id, 5));
    expect(panelFull.status).toBe(409);
    expect(JSON.stringify(await panelFull.json())).toMatch(/sube el tope de hoy/);
    session.userId = null;

    // El apartado del primero vence: su cupo vuelve.
    await testPrisma.capsuleDailySlot.update({ where: { orderId: firstId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const second = await post("checkout", capsuleCheckoutBody(editionProduct.id, 5));
    expect(second.status).toBe(200);
    const secondId = await orderIdOf(second);
    await expect(testPrisma.capsuleDailySlot.findUnique({ where: { orderId: firstId } })).resolves.toBeNull();
    await expect(testPrisma.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: secondId } })).resolves.toMatchObject({ slotNumber: 1 });

    await testPrisma.capsuleDayCap.create({ data: { storeId: f.store.id, bogotaDate: bogotaDate(new Date()), cap: 2, setBy: "paula" } });
    session.userId = f.store.userId;
    const raised = await post("orders", capsuleCheckoutBody(editionProduct.id, 5));
    expect(raised.status).toBe(200);
    await expect(testPrisma.capsuleDailySlot.findUniqueOrThrow({ where: { orderId: await orderIdOf(raised) } })).resolves.toMatchObject({ slotNumber: 2 });
  });

  it("la dueña cambia el tope de hoy desde «Sacar cápsulas»; la tienda lo respeta; nadie más puede", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    expect((await post("checkout", capsuleCheckoutBody(editionProduct.id, 5))).status).toBe(200);
    expect((await post("checkout", capsuleCheckoutBody(editionProduct.id, 5))).status).toBe(409);

    const { PUT } = await import("@/app/api/[storeId]/capsule-day-cap/route");
    const put = (cap: unknown) =>
      PUT(new Request("http://admin.test/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cap }) }), { params: { storeId: f!.store.id } });
    expect((await put(3)).status).toBe(401);
    session.userId = "user_otra_tienda";
    expect((await put(3)).status).toBe(403);
    session.userId = f.store.userId;
    expect((await put(101)).status).toBe(400);
    const raised = await put(3);
    expect(raised.status).toBe(200);
    await expect(raised.json()).resolves.toMatchObject({ cap: 3, used: 1, left: 2 });
    session.userId = null;
    expect((await post("checkout", capsuleCheckoutBody(editionProduct.id, 5))).status).toBe(200);
  });

  it("dos compras a la vez por el último cupo: gana exactamente una", async () => {
    f = await createInventoryFixture();
    const { editionProduct } = await createLiveCapsuleEdition(f, { dailyOrderCap: 1 });
    const responses = await Promise.all([post("checkout", capsuleCheckoutBody(editionProduct.id, 5)), post("checkout", capsuleCheckoutBody(editionProduct.id, 5))]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    await expect(testPrisma.order.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
    await expect(testPrisma.capsuleDailySlot.count({ where: { storeId: f.store.id } })).resolves.toBe(1);
  });
});
