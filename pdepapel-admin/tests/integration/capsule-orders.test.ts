import { CapsuleCostStatus, CapsuleSlipKind, CapsuleVideoConsent, CapsuleVideoStatus, OrderStatus, PaymentMethod } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null, claims: {} as Record<string, unknown> }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: session.userId, sessionClaims: session.claims }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/cache", async (importOriginal) => ({ ...(await importOriginal<object>()), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));

import { printCapsuleSlips } from "@/lib/capsule-slips";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * La cola de sacar: un pedido pagado de cápsulas se saca escaneando (o
 * escribiendo) cada código, elige su regalo entre los que le caben, se cierra
 * con costo real y caja sugerida, y su video avanza un paso a la vez. Los
 * pedidos se siembran a mano (el checkout de cápsulas es P4) con el costo
 * provisional ya dentro de las finanzas.
 */
let f: InventoryFixture | undefined;

async function setup() {
  f = await createInventoryFixture();
  const store = f.store.id;
  const size = await testPrisma.size.create({ data: { name: "Pequeño liviano", value: "S-L", storeId: store } }).catch(() => null);
  const make = (name: string, data: Record<string, unknown>) =>
    testPrisma.product.create({
      data: {
        name,
        slug: `${name.toLowerCase().replaceAll(" ", "-")}-${randomBytes(4).toString("hex")}`,
        description: "Producto de pruebas",
        price: 9000,
        sku: `CO-${randomBytes(4).toString("hex")}`,
        storeId: store,
        categoryId: f!.category.id,
        colorId: f!.component.colorId,
        sizeId: size?.id ?? f!.component.sizeId,
        designId: f!.component.designId,
        ...data,
      } as never,
    });
  const lapicero = await make("Lapicero", { stock: 10, acqPrice: 4000 });
  const regalo = await make("Stickers", { stock: 5, acqPrice: 1500 });
  const regaloCaro = await make("Libreta", { stock: 5, acqPrice: 2500 });
  const editionProduct = await make("Edicion", { stock: 0, acqPrice: 0, price: 12900, isArchived: true });
  const edition = await testPrisma.capsuleEdition.create({
    data: { storeId: store, number: 1, name: "Escritorio", theme: "escritorio", productId: editionProduct.id, costBandMin: 3000, costBandMax: 5000 },
  });
  await testPrisma.capsulePackOption.create({ data: { editionId: edition.id, packSize: 30, giftMaxCost: 3000, giftMaxItems: 1, giftLabel: "1 regalo", boxReserveCost: 1000 } });
  await testPrisma.box.create({ data: { storeId: store, name: "Caja S", type: "S", width: 20, height: 10, length: 21, isDefault: true } });
  await printCapsuleSlips({ storeId: store, editionId: edition.id, kind: CapsuleSlipKind.SLIP, items: [{ productId: lapicero.id, quantity: 6 }], userId: "paula" });
  await printCapsuleSlips({ storeId: store, editionId: edition.id, kind: CapsuleSlipKind.GIFT, items: [{ productId: regalo.id, quantity: 2 }, { productId: regaloCaro.id, quantity: 1 }], userId: "paula" });

  // Pack de 5 con regalo de hasta 2.000: provisional = 4.000 × 5 + 2.000 = 22.000, ya dentro de las finanzas.
  const order = await testPrisma.order.create({
    data: {
      storeId: store,
      orderNumber: `CAP-${randomBytes(4).toString("hex")}`,
      status: OrderStatus.PAID,
      paidAt: new Date(),
      fullName: "Ana María Pérez",
      subtotal: 64500,
      total: 64500,
      totalProductCost: 22000,
      gatewayFee: 3366,
      shippingCost: 0,
      netProfit: 64500 - 22000 - 3366,
      payment: { create: { method: PaymentMethod.Bold, storeId: store } },
    },
  });
  await testPrisma.capsuleOrder.create({
    data: { storeId: store, orderId: order.id, editionId: edition.id, packSize: 5, giftMaxCost: 2000, giftMaxItems: 1, provisionalCost: 22000, videoConsent: CapsuleVideoConsent.PUBLIC_FIRST_NAME },
  });
  session.userId = f.store.userId;
  session.claims = {};
  return { order, edition };
}

const routes = async () => ({
  list: (await import("@/app/api/[storeId]/capsule-orders/route")).GET,
  detail: (await import("@/app/api/[storeId]/capsule-orders/[orderId]/route")).GET,
  draw: (await import("@/app/api/[storeId]/capsule-orders/[orderId]/draw/route")).POST,
  finish: (await import("@/app/api/[storeId]/capsule-orders/[orderId]/finish/route")).POST,
  video: (await import("@/app/api/[storeId]/capsule-orders/[orderId]/video/route")).PATCH,
});
const req = (body?: unknown, method = "POST") => new Request("https://admin.test/x", body === undefined ? undefined : { method, body: JSON.stringify(body) });

beforeAll(async () => {
  await testPrisma.$connect();
});
afterEach(async () => {
  if (f) {
    await testPrisma.box.deleteMany({ where: { storeId: f.store.id } });
    await deleteInventoryFixture(f);
  }
  f = undefined;
});
afterAll(async () => {
  await testPrisma.$disconnect();
});

describe("sacar papeles de un pedido de cápsulas", () => {
  it("de la cola al cierre: códigos escritos, regalo que cabe, costo real y caja sugerida", async () => {
    const { order } = await setup();
    const api = await routes();
    const params = { params: { storeId: f!.store.id, orderId: order.id } };

    const queue = await (await api.list(req(), { params: { storeId: f!.store.id } })).json();
    expect(queue.orders).toEqual([expect.objectContaining({ orderId: order.id, firstName: "Ana", packSize: 5, giftLabel: null, slipsDrawn: 0, costStatus: CapsuleCostStatus.PROVISIONAL })]);

    const codes = (await testPrisma.capsuleSlip.findMany({ where: { kind: CapsuleSlipKind.SLIP, storeId: f!.store.id }, orderBy: { code: "asc" } })).map((slip) => slip.code);
    for (const code of codes.slice(0, 5)) expect((await api.draw(req({ code: ` ${code.toLowerCase()} ` }), params)).status).toBe(200);
    const repeated = await api.draw(req({ code: codes[0] }), params);
    expect(repeated.status).toBe(409);

    // Le caben regalos de hasta 2.000: el de 1.500 sí, el de 2.500 no.
    const detail = await (await api.detail(req(), params)).json();
    expect(detail.giftOptions.map((option: { productName: string }) => option.productName)).toEqual(["Stickers"]);
    expect((await api.finish(req({}), params)).status).toBe(409);
    expect((await api.draw(req({ code: detail.giftOptions[0].code }), params)).status).toBe(200);

    const finished = await (await api.finish(req({}), params)).json();
    // Real: 5 × 4.000 + 1.500 = 21.500; provisional 22.000.
    expect(finished).toMatchObject({ provisionalCost: 22000, realCost: 21500, delta: -500, box: { type: "S", name: "Caja S" } });
    await expect(testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ totalProductCost: 21500, netProfit: 64500 - 21500 - 3366 });
    await expect(testPrisma.capsuleOrder.findUniqueOrThrow({ where: { orderId: order.id } })).resolves.toMatchObject({ suggestedBox: "S", costStatus: CapsuleCostStatus.REAL });
    expect((await api.finish(req({}), params)).status).toBe(409);
  });

  it("el video avanza un paso a la vez; grabar exige el sorteo cerrado y publicar el permiso y el enlace", async () => {
    const { order } = await setup();
    const api = await routes();
    const params = { params: { storeId: f!.store.id, orderId: order.id } };
    const patch = (body: unknown) => api.video(req(body, "PATCH"), params);

    expect((await patch({ videoStatus: CapsuleVideoStatus.GRABADO })).status).toBe(409);
    await testPrisma.capsuleOrder.update({ where: { orderId: order.id }, data: { drawCompletedAt: new Date() } });
    expect((await patch({ videoStatus: CapsuleVideoStatus.ENVIADO })).status).toBe(409);
    expect((await patch({ videoStatus: CapsuleVideoStatus.GRABADO })).status).toBe(200);
    expect((await patch({ videoStatus: CapsuleVideoStatus.ENVIADO })).status).toBe(200);
    expect((await patch({ videoStatus: CapsuleVideoStatus.PUBLICADO })).status).toBe(400);
    expect((await patch({ videoUrl: "http://no-seguro.test/v" })).status).toBe(400);
    expect((await patch({ videoStatus: CapsuleVideoStatus.PUBLICADO, videoUrl: "https://www.tiktok.com/@pdepapel/video/1" })).status).toBe(200);

    await testPrisma.capsuleOrder.update({ where: { orderId: order.id }, data: { videoStatus: CapsuleVideoStatus.ENVIADO, videoConsent: CapsuleVideoConsent.PRIVATE } });
    expect((await patch({ videoStatus: CapsuleVideoStatus.PUBLICADO })).status).toBe(409);
  });

  it("la cuenta de solo lectura no entra a la cola ni a ninguna acción", async () => {
    const { order } = await setup();
    const api = await routes();
    session.userId = "user_viewer_queue";
    session.claims = { metadata: { role: "viewer", allowedStoreIds: [f!.store.id] } };
    const params = { params: { storeId: f!.store.id, orderId: order.id } };
    expect((await api.list(req(), { params: { storeId: f!.store.id } })).status).toBe(403);
    expect((await api.detail(req(), params)).status).toBe(403);
    expect((await api.draw(req({ code: "x" }), params)).status).toBe(403);
    expect((await api.finish(req({}), params)).status).toBe(403);
    expect((await api.video(req({ videoUrl: "https://x.test" }, "PATCH"), params)).status).toBe(403);
  });
});
