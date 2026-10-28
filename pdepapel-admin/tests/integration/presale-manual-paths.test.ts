import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ProductPresaleStatus, ShippingProvider, ShippingStatus } from "@prisma/client";

import { dispatchQueueWhere, getOrderQueue } from "@/lib/order-queues";
import { PRESALE_HOLD_GUIDE_MESSAGE } from "@/lib/presale-hold";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Preventa en los caminos a mano (Lote 0): marcar pagado una transferencia,
 * volverla a pendiente, marcar en bloque y borrar. Una línea de preventa sin
 * liberar suma o devuelve cupo y NUNCA mueve inventario; la línea normal del
 * mismo pedido sí. El pedido pagado espera entero: no entra a «Por despachar»
 * ni se le puede crear guía.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/whatsapp/send", async (importOriginal) => ({ ...(await importOriginal<object>()), sendWhatsAppTemplateMessage: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/envioclick")>()), envioClickClient: { createShipment: vi.fn(), quoteShipment: vi.fn() } }));
vi.mock("@/lib/resource-lock", () => ({ withResourceLock: (_k: string, _m: string, run: () => Promise<unknown>) => run(), ResourceBusyError: class extends Error {} }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: async () => ({ allowed: true, remaining: 9, retryAfterSeconds: 0 }), getClientKey: () => "test" }));

const json = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: body === undefined ? undefined : JSON.stringify(body) });

let f: InventoryFixture;
let agendaId = "";
let presaleId = "";

async function flushBackground() {
  while (background.pending.length > 0) await Promise.all(background.pending.splice(0));
}

/** Pedido de la tienda por transferencia: 2 agendas en preventa + 1 componente que sí está en bodega. */
async function preorderOrder(status: OrderStatus = OrderStatus.PENDING) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-PRE-${randomUUID()}`,
      status,
      ...(status === OrderStatus.PAID ? { paidAt: new Date() } : {}),
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      fullName: "Clienta Preventa",
      phone: "+573001112233",
      email: "clienta-preventa@prueba.test",
      address: "Calle 1 # 2-3",
      city: "Medellín",
      department: "Antioquia",
      daneCode: "05001000",
      subtotal: 30000,
      total: 30000,
      orderItems: {
        create: [
          { productId: agendaId, name: "Agenda preventa", quantity: 2, price: 10000, isPreorder: true, presaleId },
          { productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 },
        ],
      },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.BankTransfer } },
      shipping: { create: { storeId: f.store.id, provider: ShippingProvider.MANUAL, status: ShippingStatus.Preparing, carrierName: "ENVIA" } },
    },
  });
}

const committed = async () => (await testPrisma.productPresale.findUniqueOrThrow({ where: { id: presaleId } })).committedUnits;
const agendaMoves = () => testPrisma.inventoryMovement.count({ where: { productId: agendaId } });
const stockOf = async (id: string) => (await testPrisma.product.findUniqueOrThrow({ where: { id } })).stock;

async function patchOrder(orderId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
  const response = await PATCH(json("PATCH", body), { params: { storeId: f.store.id, orderId } });
  await flushBackground();
  return response;
}

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  const agenda = await testPrisma.product.create({
    data: {
      name: "Agenda preventa",
      slug: `agenda-preventa-${randomUUID().slice(0, 8)}`,
      description: "d",
      stock: 0,
      price: 10000,
      acqPrice: 4000,
      sku: `AGE-PRE-${randomUUID().slice(0, 8)}`,
      storeId: f.store.id,
      categoryId: f.category.id,
      colorId: f.component.colorId,
      sizeId: f.component.sizeId,
      designId: f.component.designId,
    },
  });
  agendaId = agenda.id;
  presaleId = (
    await testPrisma.productPresale.create({
      data: { storeId: f.store.id, productId: agendaId, status: ProductPresaleStatus.ACTIVE, unitLimit: 50, expectedArrivalAt: new Date(Date.now() + 20 * 86_400_000), createdBy: "test" },
    })
  ).id;
});

beforeEach(async () => {
  await testPrisma.productPresale.update({ where: { id: presaleId }, data: { committedUnits: 0 } });
});

afterAll(async () => {
  const orders = await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await testPrisma.inventoryMovement.deleteMany({ where: { storeId: f.store.id } });
  await testPrisma.orderInventoryIssue.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderNotification.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.shipping.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.paymentDetails.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await testPrisma.order.deleteMany({ where: { id: { in: ids } } });
  await testPrisma.productPresale.deleteMany({ where: { id: presaleId } });
  await testPrisma.product.deleteMany({ where: { id: agendaId } });
  await deleteInventoryFixture(f);
});

describe("preventa en los caminos a mano", () => {
  it("marcar pagada una transferencia y cancelarla: la preventa suma y devuelve cupo sin tocar inventario; la línea normal sí se mueve", async () => {
    const order = await preorderOrder();
    const componentBefore = await stockOf(f.component.id);
    const response = await patchOrder(order.id, { status: OrderStatus.PAID });
    expect(response.status).toBe(200);
    expect(await committed()).toBe(2);
    expect(await agendaMoves()).toBe(0);
    expect(await stockOf(agendaId)).toBe(0);
    expect(await stockOf(f.component.id)).toBe(componentBefore - 1);

    // Cancelar (la única salida de un pagado): el cupo regresa y solo reingresa lo que salió de bodega.
    const back = await patchOrder(order.id, { status: OrderStatus.CANCELLED });
    expect(back.status).toBe(200);
    expect(await committed()).toBe(0);
    expect(await agendaMoves()).toBe(0);
    expect(await stockOf(f.component.id)).toBe(componentBefore);
  });

  it("marcar en bloque no pide stock de la preventa y suma el cupo de cada pedido", async () => {
    const a = await preorderOrder();
    const b = await preorderOrder();
    const { PATCH } = await import("@/app/api/[storeId]/orders/route");
    const response = await PATCH(json("PATCH", { ids: [a.id, b.id], status: OrderStatus.PAID }), { params: { storeId: f.store.id } });
    await flushBackground();
    expect(response.status).toBe(200);
    expect(await committed()).toBe(4);
    expect(await agendaMoves()).toBe(0);
  });

  it("borrar un pedido pagado devuelve el cupo sin inventar agendas", async () => {
    const order = await preorderOrder();
    expect((await patchOrder(order.id, { status: OrderStatus.PAID })).status).toBe(200);
    expect(await committed()).toBe(2);
    const { DELETE } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const response = await DELETE(json("DELETE"), { params: { storeId: f.store.id, orderId: order.id } });
    await flushBackground();
    expect(response.status).toBe(200);
    expect(await committed()).toBe(0);
    expect(await agendaMoves()).toBe(0);
  });

  it("el pedido pagado espera entero: no está en «Por despachar», su cola es «presale» y no se le crea guía", async () => {
    const order = await preorderOrder();
    expect((await patchOrder(order.id, { status: OrderStatus.PAID })).status).toBe(200);

    const inDispatch = await testPrisma.order.count({ where: { AND: [dispatchQueueWhere(f.store.id), { id: order.id }] } });
    expect(inDispatch).toBe(0);
    expect(getOrderQueue({ status: OrderStatus.PAID, type: OrderType.STANDARD, payment: { method: PaymentMethod.BankTransfer }, shipping: { status: ShippingStatus.Preparing, provider: ShippingProvider.MANUAL }, heldByPresale: true })).toBe("presale");

    const { createGuideForOrder } = await import("@/lib/shipping-helpers");
    await expect(createGuideForOrder(order.id, f.store.id)).rejects.toMatchObject({ statusCode: 409, message: PRESALE_HOLD_GUIDE_MESSAGE });
  });
});
