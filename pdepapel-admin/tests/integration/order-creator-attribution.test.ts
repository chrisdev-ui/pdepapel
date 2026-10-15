import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { InventoryMovementType, OrderSource, OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import { NextRequest } from "next/server";

import { canCustomerViewOrder } from "@/lib/public-orders";
import { retryFailedNotifications } from "@/lib/notification-retry";

import {
  applyOrderOwnerBackfill,
  assertExpectedRows,
  CREATED_PAID_WINDOW_MS,
  planOrderOwnerBackfill,
  verifyOrderOwnerBackfill,
} from "../../scripts/lib/order-owner-userid-backfill.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Quién registra un pedido y quién es la clienta, contra MySQL. Desde el panel,
 * la dueña va en `createdBy` y `userId` es solo de una clienta de verdad; los
 * 516 pedidos viejos con la dueña como clienta se corrigen con un backfill que
 * no manda correos ni avisos.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const sent = vi.hoisted(() => ({ email: [] as unknown[], resend: [] as unknown[] }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  currentUser: async () => null,
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue({ id: "user_clienta" }) } }),
}));
vi.mock("@/lib/email", () => ({
  sendOrderEmail: vi.fn(async (...args: unknown[]) => void sent.email.push(args)),
  sendShippingEmail: vi.fn(async (...args: unknown[]) => void sent.email.push(args)),
}));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn(async (...args: unknown[]) => void sent.resend.push(args)) } } }));
vi.mock("@/lib/gift-card-delivery", () => ({ deliverGiftCard: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ storefrontScopeOf: vi.fn().mockResolvedValue(null), revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined), invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", async (importOriginal) => ({ ...(await importOriginal<object>()), createGuideForOrder: vi.fn() }));
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

const customer = { fullName: "Luisa Sánchez", phone: "+573009999999", email: "luisa@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };

const post = (body: unknown) =>
  new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json", Origin: "https://papeleriapdepapel.com" }, body: JSON.stringify(body) });

const orderBody = (f: InventoryFixture, extra: Record<string, unknown> = {}) => ({
  ...customer,
  type: OrderType.STANDARD,
  orderItems: [{ productId: f.component.id, quantity: 1 }],
  payment: { method: PaymentMethod.BankTransfer },
  shipping: { provider: "CUSTOM", carrierName: "Mensajería Medellín", courier: "Mensajería", cost: 5000 },
  subtotal: 10000,
  total: 15000,
  ...extra,
});

describe("quién registra el pedido y quién es la clienta (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    session.userId = null;
    sent.email.length = 0;
    sent.resend.length = 0;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const create = async (body: Record<string, unknown>) => {
    const { POST } = await import("@/app/api/[storeId]/orders/route");
    const response = await POST(post(body), { params: { storeId: fixture!.store.id } });
    expect(response.status).toBe(200);
    const { id } = (await response.json()) as { id: string };
    return testPrisma.order.findUniqueOrThrow({ where: { id }, select: { id: true, userId: true, createdBy: true, source: true } });
  };

  it("desde el panel sin clienta: la dueña es la creadora, nunca la clienta, aunque el cuerpo traiga otro createdBy", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;

    const order = await create(orderBody(fixture, { status: OrderStatus.PAID, createdBy: "otra-persona" }));

    expect(order).toMatchObject({ userId: null, createdBy: fixture.store.userId, source: OrderSource.PANEL });
    const movements = await testPrisma.inventoryMovement.findMany({ where: { referenceId: order.id, type: InventoryMovementType.ORDER_PLACED }, select: { createdBy: true } });
    expect(movements).toEqual([{ createdBy: fixture.store.userId }]);
  });

  it("desde el panel con una clienta con cuenta: ella en userId, la dueña en createdBy", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;

    const order = await create(orderBody(fixture, { userId: "user_clienta" }));

    expect(order).toMatchObject({ userId: "user_clienta", createdBy: fixture.store.userId, source: OrderSource.PANEL });
  });

  it("desde la tienda con sesión: la clienta en userId y sin creadora", async () => {
    fixture = await createInventoryFixture();
    session.userId = `user_${randomUUID()}`;

    const order = await create(orderBody(fixture, { userId: session.userId }));

    expect(order).toMatchObject({ userId: session.userId, createdBy: null, source: OrderSource.STORE });
  });

  it("«Mis pedidos» de la dueña no lista los pedidos que registró desde el panel", async () => {
    fixture = await createInventoryFixture();
    session.userId = fixture.store.userId;
    await create(orderBody(fixture));

    const { GET } = await import("@/app/api/[storeId]/orders/route");
    const response = await GET(new NextRequest("http://admin.test/api/x"), { params: { storeId: fixture.store.id } });

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Total-Count")).toBe("0");
  });

  it("el enlace del pedido: abre los de invitada y los del panel; el de una clienta con cuenta, solo con su sesión", () => {
    expect(canCustomerViewOrder({ userId: null, createdBy: "dueña" }, null)).toBe(true);
    expect(canCustomerViewOrder({ userId: "", createdBy: null }, null)).toBe(true);
    expect(canCustomerViewOrder({ userId: "user_clienta", createdBy: "dueña" }, null)).toBe(true);
    expect(canCustomerViewOrder({ userId: "user_clienta", createdBy: null }, "user_clienta")).toBe(true);
    expect(canCustomerViewOrder({ userId: "user_clienta", createdBy: null }, "user_otra")).toBe(false);
    expect(canCustomerViewOrder({ userId: "user_clienta", createdBy: null }, null)).toBe(false);
  });
});

describe("backfill de los pedidos con la dueña como clienta (MySQL)", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    sent.email.length = 0;
    sent.resend.length = 0;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Un pedido viejo; `placedAfterMs` deja el ORDER_PLACED a esa distancia de su creación. */
  const legacy = async (f: InventoryFixture, data: Record<string, unknown>, opts: { method?: PaymentMethod; placedAfterMs?: number } = {}) => {
    const createdAt = (data.createdAt as Date | undefined) ?? new Date("2026-03-10T15:00:00.000Z");
    const order = await testPrisma.order.create({
      data: { storeId: f.store.id, orderNumber: `ORD-OWN-${randomUUID().slice(0, 8)}`, status: OrderStatus.SENT, type: OrderType.STANDARD, subtotal: 10000, total: 10000, ...customer, ...data, createdAt },
    });
    if (opts.method) await testPrisma.paymentDetails.create({ data: { storeId: f.store.id, orderId: order.id, method: opts.method } });
    if (opts.placedAfterMs !== undefined) {
      await testPrisma.inventoryMovement.create({
        data: {
          storeId: f.store.id,
          productId: f.component.id,
          type: InventoryMovementType.ORDER_PLACED,
          quantity: -1,
          previousStock: 6,
          newStock: 5,
          reason: `Orden #${order.orderNumber}`,
          referenceId: order.id,
          createdBy: f.store.userId,
          createdAt: new Date(createdAt.getTime() + opts.placedAfterMs),
        },
      });
    }
    return order.id;
  };

  it("dueña a creadora, clienta en null, PANEL solo con prueba; sin correos y otra corrida no hace nada", async () => {
    fixture = await createInventoryFixture();
    const f = fixture;
    const owner = f.store.userId;
    const ids = {
      creadoPagado: await legacy(f, { userId: owner }, { method: PaymentMethod.BankTransfer, placedAfterMs: 2_000 }),
      creadoPagadoConCreadora: await legacy(f, { userId: owner, createdBy: owner }, { method: PaymentMethod.COD, placedAfterMs: 4_000 }),
      pagadoDespues: await legacy(f, { userId: owner }, { method: PaymentMethod.BankTransfer, placedAfterMs: CREATED_PAID_WINDOW_MS + 60_000 }),
      enLinea: await legacy(f, { userId: owner }, { method: PaymentMethod.Wompi, placedAfterMs: 1_000 }),
      antesDelKardex: await legacy(f, { userId: owner, createdAt: new Date("2024-05-01T12:00:00.000Z") }, { method: PaymentMethod.BankTransfer }),
      clientaDeVerdad: await legacy(f, { userId: "user_clienta" }, { method: PaymentMethod.BankTransfer, placedAfterMs: 1_000 }),
      invitada: await legacy(f, { guestId: `guest-${randomUUID()}` }, { method: PaymentMethod.BankTransfer }),
    };

    const plan = await planOrderOwnerBackfill(testPrisma, f.store.id);
    expect(plan.ids).toHaveLength(5);
    expect(plan.withoutCreator).toHaveLength(4);
    expect(plan.buckets).toEqual({ panel_creado_pagado: 2, pago_en_linea: 1, sin_prueba: 1, sin_prueba_antes_del_kardex: 1 });
    expect(() => assertExpectedRows(plan, 516)).toThrow(/no escribo nada/);
    assertExpectedRows(plan, 5);

    await expect(applyOrderOwnerBackfill(testPrisma, plan)).resolves.toEqual({ createdBy: 4, userId: 5, source: 2 });

    const rows = await testPrisma.order.findMany({ where: { storeId: f.store.id }, select: { id: true, userId: true, createdBy: true, source: true } });
    const by = Object.fromEntries(rows.map(({ id, ...rest }) => [id, rest]));
    expect(Object.fromEntries(Object.entries(ids).map(([label, id]) => [label, by[id]]))).toEqual({
      creadoPagado: { userId: null, createdBy: owner, source: OrderSource.PANEL },
      creadoPagadoConCreadora: { userId: null, createdBy: owner, source: OrderSource.PANEL },
      pagadoDespues: { userId: null, createdBy: owner, source: null },
      enLinea: { userId: null, createdBy: owner, source: null },
      antesDelKardex: { userId: null, createdBy: owner, source: null },
      clientaDeVerdad: { userId: "user_clienta", createdBy: null, source: null },
      invitada: { userId: "", createdBy: null, source: null },
    });
    await expect(verifyOrderOwnerBackfill(testPrisma, f.store.id)).resolves.toEqual({
      ownerAsCustomer: 0,
      ownerAsCreator: 5,
      bySource: { PANEL: 2, null: 5 },
    });

    // Nada sale: ni correos, ni avisos pendientes que el barrido de reintentos recoja.
    expect(sent.email).toEqual([]);
    expect(sent.resend).toEqual([]);
    await expect(testPrisma.failedNotification.count({ where: { orderId: { in: Object.values(ids) } } })).resolves.toBe(0);
    const sweep = await retryFailedNotifications({ db: testPrisma, sendOrderEmail: vi.fn(), sendShippingEmail: vi.fn() });
    expect(sweep.sent.filter((row) => Object.values(ids).includes(row.orderId))).toEqual([]);

    const again = await planOrderOwnerBackfill(testPrisma, f.store.id);
    expect(again.ids).toHaveLength(0);
    await expect(applyOrderOwnerBackfill(testPrisma, again)).resolves.toEqual({ createdBy: 0, userId: 0, source: 0 });
  });

  it("ya corregido, el enlace del pedido viejo se sigue abriendo sin la dueña como clienta", async () => {
    fixture = await createInventoryFixture();
    const id = await legacy(fixture, { userId: fixture.store.userId }, { method: PaymentMethod.BankTransfer });
    await applyOrderOwnerBackfill(testPrisma, await planOrderOwnerBackfill(testPrisma, fixture.store.id));

    const order = await testPrisma.order.findUniqueOrThrow({ where: { id }, select: { userId: true, createdBy: true } });
    expect(canCustomerViewOrder(order, null)).toBe(true);
  });
});
