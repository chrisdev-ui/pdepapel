import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";
import { INVALIDATION_BUDGET_MS } from "@/lib/cache";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";

/**
 * Regresión del incidente del 2026-09-29: «Marcar como pagado» se colgaba
 * hasta los 60 s de Vercel porque la invalidación de caché esperaba sin tope
 * a Redis, dentro de la transacción del pedido. Aquí Redis se cuelga de
 * verdad (el SCAN nunca responde) y aun así el pedido —uno sin fila de envío,
 * como el de Paula— queda pagado y la respuesta llega dentro del presupuesto.
 * Lo mismo para un pedido que nace pagado, el cambio de estado en lote y el
 * borrado en lote que devuelve inventario: los cuatro sitios que purgaban
 * dentro de la transacción.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const redis = vi.hoisted(() => ({
  scan: () => new Promise(() => {}),
  get: async () => null,
  set: async () => "OK",
  del: async () => 1,
  incr: async () => 1,
  expire: async () => 1,
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: () => ({ userId: session.userId }), clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }) }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn().mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/mercadolibre/outbox", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  enqueuePendingMarketplaceOutboxEventsForStore: vi.fn().mockResolvedValue(0),
}));
// Redis colgado en el SCAN de la purga; el resto responde para que la
// idempotencia y los contadores no sean lo que se mide aquí.
vi.mock("@upstash/redis", () => {
  class Redis {
    static fromEnv() {
      return redis;
    }
  }
  return { Redis };
});

const json = (method: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com", ...headers }, body: JSON.stringify(body) });
const buyer = { fullName: "Manuela Osorio", phone: "+573009999999", email: "manuela@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };
const BUDGET = INVALIDATION_BUDGET_MS + 4000;

describe("marcar pagado con Redis colgado (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  beforeAll(async () => { await testPrisma.$connect(); });
  afterEach(async () => { if (fixture) { await deleteInventoryFixture(fixture); fixture = undefined; } session.userId = null; });
  afterAll(async () => { await testPrisma.$disconnect(); });

  const createPending = async (f: InventoryFixture) => {
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(
      json("POST", { ...buyer, type: OrderType.STANDARD, status: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer }, orderItems: [{ productId: f.component.id, quantity: 1 }], subtotal: 10000, total: 10000 }, { "Idempotency-Key": `k-${Date.now()}-${Math.random()}` }),
      { params: { storeId: f.store.id } },
    );
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; status: OrderStatus };
  };

  it("un pedido sin fila de envío queda pagado y la respuesta no espera a Redis", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const created = await createPending(fixture);
    const before = await testPrisma.order.findUniqueOrThrow({ where: { id: created.id }, include: { shipping: true } });
    expect(before.shipping).toBeNull();

    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const started = Date.now();
    const response = await PATCH(
      json("PATCH", { ...buyer, status: OrderStatus.PAID, expectedStatus: before.status, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-9999" }, shipping: { provider: "NONE", status: "Preparing", cost: 0 }, orderItems: [{ productId: fixture.component.id, quantity: 1, price: 10000 }], subtotal: 10000, total: 10000, skipAutoGuide: true }),
      { params: { storeId: fixture.store.id, orderId: created.id } },
    );
    const elapsed = Date.now() - started;
    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(BUDGET);
    const after = await testPrisma.order.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.status).toBe(OrderStatus.PAID);
    expect(after.paidAt).not.toBeNull();
    const product = await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } });
    expect(product.stock).toBe(5);
  }, 30_000);

  it("un pedido que nace pagado desde el panel responde dentro del presupuesto", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const started = Date.now();
    const response = await POST(
      json("POST", { ...buyer, type: OrderType.STANDARD, status: OrderStatus.PAID, payment: { method: PaymentMethod.CASH }, orderItems: [{ productId: fixture.component.id, quantity: 1 }], subtotal: 10000, total: 10000 }, { "Idempotency-Key": `k-${Date.now()}-${Math.random()}` }),
      { params: { storeId: fixture.store.id } },
    );
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(BUDGET);
    const order = (await response.json()) as { id: string };
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PAID);
  }, 30_000);

  it("el cambio de estado en lote y el borrado en lote tampoco esperan a Redis", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    const created = await createPending(fixture);
    const { PATCH, DELETE } = await import("@/app/api/[storeId]/orders/route");

    let started = Date.now();
    const paid = await PATCH(json("PATCH", { ids: [created.id], status: OrderStatus.PAID }), { params: { storeId: fixture.store.id } });
    expect(paid.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(BUDGET);
    expect((await testPrisma.order.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(OrderStatus.PAID);
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).stock).toBe(5);

    started = Date.now();
    const deleted = await DELETE(json("DELETE", { ids: [created.id] }), { params: { storeId: fixture.store.id } });
    expect(deleted.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(BUDGET);
    expect(await testPrisma.order.findUnique({ where: { id: created.id } })).toBeNull();
    // El borrado de un pedido pagado devuelve el inventario.
    expect((await testPrisma.product.findUniqueOrThrow({ where: { id: fixture.component.id } })).stock).toBe(6);
  }, 60_000);
});
