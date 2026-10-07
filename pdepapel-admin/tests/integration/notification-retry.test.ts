import { randomUUID } from "node:crypto";

import { OrderStatus, PaymentMethod } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DeliveryOutcome, EmailRole } from "@/lib/email-delivery";
import { MAX_EMAIL_ATTEMPTS, retryFailedNotifications } from "@/lib/notification-retry";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

/**
 * Barrido de correos de pedido perdidos (incidente del 2026-10-07): reenvía
 * lo que falló en las últimas 48 h, marca `resolvedAt` al lograrlo, se
 * detiene al agotar los intentos y nunca manda dos veces la misma fila
 * aunque dos corridas coincidan.
 */
describe("failed notification retry sweep with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  const NOW = new Date("2026-10-08T13:00:00.000Z");

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.failedNotification.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
    }
    fixture = undefined;
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  async function seedOrder(status: OrderStatus = OrderStatus.PENDING, email: string | null = "cliente@prueba.test") {
    fixture = await createInventoryFixture();
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status,
        fullName: "Cliente Prueba",
        phone: "+573001234567",
        email,
        address: "Calle 1 # 2-3",
        subtotal: 15000,
        total: 15000,
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: fixture.store.id } },
      },
    });
    return order;
  }

  const failure = (orderId: string, data: { kind?: string; recipient?: string | null; createdAt?: Date; resolvedAt?: Date | null } = {}) =>
    testPrisma.failedNotification.create({
      data: {
        storeId: fixture!.store.id,
        channel: "EMAIL",
        kind: data.kind ?? "order:PENDING",
        recipient: data.recipient === undefined ? "cliente@prueba.test" : data.recipient,
        orderId,
        error: "TypeError: fetch failed",
        createdAt: data.createdAt ?? new Date("2026-10-07T13:40:35.000Z"),
        resolvedAt: data.resolvedAt ?? null,
      },
    });

  const ok = (roles: EmailRole[]): Partial<Record<EmailRole, DeliveryOutcome>> =>
    Object.fromEntries(roles.map((role) => [role, { ok: true, attempts: 1 }]));
  const fail = (roles: EmailRole[]): Partial<Record<EmailRole, DeliveryOutcome>> =>
    Object.fromEntries(roles.map((role) => [role, { ok: false, attempts: 3, error: "fetch failed", retryable: true }]));

  const rowsOf = (orderId: string) =>
    testPrisma.failedNotification.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

  it("resends a pre-fix row (address in recipient) to admin and customer and resolves it", async () => {
    const order = await seedOrder();
    const row = await failure(order.id);
    const sendOrderEmail = vi.fn(async (_orderId: string, _status: never, options: { roles: EmailRole[] }) => ok(options.roles));

    const summary = await retryFailedNotifications({ db: testPrisma, now: NOW, sendOrderEmail });

    expect(sendOrderEmail).toHaveBeenCalledTimes(1);
    const [sentOrderId, sentStatus, options] = sendOrderEmail.mock.calls[0] as unknown as [string, string, { roles: EmailRole[]; recordFailures: boolean }];
    // Solo el id: el correo carga el pedido completo (con artículos) por su cuenta.
    expect(sentOrderId).toBe(order.id);
    expect(sentStatus).toBe("PENDING");
    expect(options).toEqual({ roles: ["admin", "customer"], recordFailures: false });
    expect(summary.sent.map((s) => s.role).sort()).toEqual(["admin", "customer"]);
    const rows = await rowsOf(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(row.id);
    expect(rows[0].resolvedAt).toEqual(NOW);
  });

  it("on failure leaves a new row per role for the next sweep, and stops at the attempt limit", async () => {
    const order = await seedOrder();
    await failure(order.id, { recipient: "admin" });
    const sendOrderEmail = vi.fn(async (_o: string, _s: never, options: { roles: EmailRole[] }) => fail(options.roles));

    for (let run = 1; run <= MAX_EMAIL_ATTEMPTS + 2; run += 1) {
      await retryFailedNotifications({ db: testPrisma, now: new Date(NOW.getTime() + run * 60_000), sendOrderEmail });
    }

    // 1 fallo original + 3 reenvíos = 4 intentos; después ya no se manda.
    expect(sendOrderEmail).toHaveBeenCalledTimes(MAX_EMAIL_ATTEMPTS - 1);
    expect(sendOrderEmail.mock.calls.every((call) => JSON.stringify((call[2] as { roles: string[] }).roles) === '["admin"]')).toBe(true);
    const rows = await rowsOf(order.id);
    expect(rows).toHaveLength(MAX_EMAIL_ATTEMPTS);
    expect(rows.filter((r) => r.resolvedAt === null)).toHaveLength(1); // el último queda a la vista
    expect(rows.every((r) => r.recipient === "admin")).toBe(true);

    const final = await retryFailedNotifications({ db: testPrisma, now: new Date(NOW.getTime() + 60 * 60_000), sendOrderEmail });
    expect(final.exhausted).toBe(1);
  });

  it("ignores rows older than 48 h", async () => {
    const order = await seedOrder();
    await failure(order.id, { createdAt: new Date(NOW.getTime() - 49 * 60 * 60 * 1000) });
    const sendOrderEmail = vi.fn();

    const summary = await retryFailedNotifications({ db: testPrisma, now: NOW, sendOrderEmail });

    expect(summary.scanned).toBe(0);
    expect(sendOrderEmail).not.toHaveBeenCalled();
  });

  it("five concurrent sweeps send the row only once", async () => {
    const order = await seedOrder();
    await failure(order.id, { recipient: "customer" });
    const sendOrderEmail = vi.fn(async (_o: string, _s: never, options: { roles: EmailRole[] }) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return ok(options.roles);
    });

    const runs = await Promise.all(
      Array.from({ length: 5 }, () => retryFailedNotifications({ db: testPrisma, now: NOW, sendOrderEmail })),
    );

    expect(sendOrderEmail).toHaveBeenCalledTimes(1);
    expect(runs.reduce((sum, run) => sum + run.sent.length, 0)).toBe(1);
    // Las demás corridas o la encontraron ya tomada o ni la vieron (leyeron
    // cuando ya estaba resuelta): según el orden, entre 0 y 4 cuentan como
    // «ya tomada». Lo que importa es que se mandó una sola vez.
    expect(runs.reduce((sum, run) => sum + run.alreadyClaimed, 0)).toBeLessThanOrEqual(4);
    expect((await rowsOf(order.id)).every((row) => row.resolvedAt !== null)).toBe(true);
  });

  it("does not resend a stale status: a lost «Pendiente» of an order that is now paid is resolved without sending", async () => {
    const order = await seedOrder(OrderStatus.PAID);
    await failure(order.id);
    const sendOrderEmail = vi.fn();

    const summary = await retryFailedNotifications({ db: testPrisma, now: NOW, sendOrderEmail });

    expect(sendOrderEmail).not.toHaveBeenCalled();
    expect(summary.superseded).toBe(1);
    expect((await rowsOf(order.id))[0].resolvedAt).toEqual(NOW);
  });

  it("a customer row for an order with the placeholder address is resolved without a new failure row", async () => {
    const order = await seedOrder(OrderStatus.PENDING, "clientesvarios@gmail.com");
    await failure(order.id, { recipient: "customer" });
    // lib/email.ts no arma el correo de la clienta para un correo de relleno: no hay resultado.
    const sendOrderEmail = vi.fn(async () => ({}));

    const summary = await retryFailedNotifications({ db: testPrisma, now: NOW, sendOrderEmail });

    expect(summary.failed).toEqual([]);
    const rows = await rowsOf(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].resolvedAt).toEqual(NOW);
  });

  it("never touches EnvioClick guide failures", async () => {
    const order = await seedOrder();
    await testPrisma.failedNotification.create({
      data: { storeId: fixture!.store.id, channel: "GUIDE", kind: "guide:create", orderId: order.id, error: "saldo insuficiente", createdAt: NOW },
    });
    const sendOrderEmail = vi.fn();
    const sendShippingEmail = vi.fn();

    const summary = await retryFailedNotifications({ db: testPrisma, now: NOW, sendOrderEmail, sendShippingEmail });

    expect(summary.scanned).toBe(0);
    expect((await rowsOf(order.id))[0].resolvedAt).toBeNull();
  });
});
