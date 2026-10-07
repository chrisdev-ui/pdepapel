import { randomUUID } from "node:crypto";

import { render } from "@react-email/render";
import { OrderStatus, OrderType, PaymentMethod } from "@prisma/client";
import type { ReactElement } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { recalculateKitStock } from "@/lib/inventory";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Regresión del 2026-10-07 (ORD-1791380325794-318): Paula marcó el pedido
 * como pagado desde el panel y el «Pago confirmado» salió con «Sin artículos
 * registrados.». El PATCH armaba el pedido del correo con cinco campos.
 *
 * Aquí el recorrido es el de verdad: un pedido con dos líneas en MySQL, el
 * PATCH / DELETE del panel, el trabajo en segundo plano que espera
 * `waitUntil`, y el HTML que se le entrega a Resend. Si el correo vuelve a
 * recibir un pedido sin artículos mientras la base los tiene, esto falla.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const background = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
const resendSend = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
// with-test-env.mjs fija NODE_ENV=development y en desarrollo el correo no se
// arma: sin esto la prueba pasaría sin pintar nada.
vi.mock("@/lib/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: Record<string, unknown> }>();
  return { env: new Proxy(actual.env, { get: (target, key) => (key === "NODE_ENV" ? "production" : Reflect.get(target, key)) }) };
});
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: resendSend } } }));
vi.mock("@vercel/functions", () => ({ waitUntil: (promise: Promise<unknown>) => background.pending.push(promise) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/shipping-helpers", () => ({ createGuideForOrder: vi.fn().mockResolvedValue({ data: { idOrder: 1, tracker: "T" } }) }));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined) }));

const json = (method: string, body: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const customer = { fullName: "Cliente Prueba", phone: "+573001234567", email: "cliente@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia" };

async function flushBackground() {
  while (background.pending.length > 0) {
    await Promise.all(background.pending.splice(0));
  }
}

const renderSent = async () =>
  Promise.all(
    resendSend.mock.calls.map(async ([payload]) => ({
      to: (payload as { to: string[] }).to,
      subject: (payload as { subject: string }).subject,
      text: (payload as { text: string }).text,
      // Ver tests/unit/lib/email-order-content.test.ts sobre el NUL de render 2.x.
      html: (await render((payload as { react: ReactElement }).react)).replace(/<!--[\s\S]*?-->/g, "").replace(/\u0000/g, ""),
    })),
  );

describe("order emails from the panel carry the order's items (MySQL)", () => {
  let fixture: InventoryFixture | undefined;
  let errors = vi.spyOn(console, "error");

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) {
      await testPrisma.failedNotification.deleteMany({ where: { storeId: fixture.store.id } });
      await testPrisma.orderAccountClaim.deleteMany({ where: { storeId: fixture.store.id } });
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
    session.userId = null;
    background.pending = [];
    resendSend.mockReset();
    errors.mockRestore();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  /** Dos líneas: un producto ×2 y un kit ×1, más 6.200 de envío. */
  async function seedOrder(status: OrderStatus = OrderStatus.PENDING) {
    fixture = await createInventoryFixture();
    await recalculateKitStock(testPrisma, [fixture.kit.id]); // 6 unidades / 2 por kit = 3 kits
    session.userId = fixture.store.userId;
    resendSend.mockResolvedValue({ data: { id: "em" }, error: null });
    const order = await testPrisma.order.create({
      data: {
        storeId: fixture.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status,
        type: OrderType.STANDARD,
        ...customer,
        subtotal: 27500,
        total: 33700,
        ...(status === OrderStatus.PAID ? { paidAt: new Date() } : {}),
        orderItems: {
          create: [
            { productId: fixture.component.id, quantity: 2, name: "Agenda Componente", price: 10000, sku: fixture.component.sku ?? "SKU" },
            { productId: fixture.kit.id, quantity: 1, name: "Kit de agendas", price: 7500, sku: "KIT" },
          ],
        },
        payment: { create: { method: PaymentMethod.BankTransfer, storeId: fixture.store.id } },
        shipping: { create: { storeId: fixture.store.id, cost: 6200 } },
      },
    });
    return order;
  }

  function expectItems(email: { html: string; text: string }, money: (value: number) => string) {
    expect(email.html).not.toContain("Sin artículos registrados.");
    expect(email.html).toContain("Agenda Componente");
    expect(email.html).toContain("×2");
    expect(email.html).toContain(money(20000));
    expect(email.html).toContain("Kit de agendas");
    expect(email.html).toContain(money(7500));
    expect(email.html).toContain("Envío");
    expect(email.html).toContain(money(6200));
    expect(email.html).toContain(money(33700));
    expect(email.text).toContain("• Agenda Componente x2");
    expect(email.text).toContain("• Kit de agendas x1");
  }

  it("«Marcar como pagado» from the panel sends the customer the items and totals", async () => {
    const { currencyFormatter } = await import("@/lib/utils");
    const order = await seedOrder();
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    // Transferencia: pasa a pagado solo con la referencia que verificó el admin.
    const response = await PATCH(json("PATCH", { status: OrderStatus.PAID, expectedStatus: OrderStatus.PENDING, payment: { method: PaymentMethod.BankTransfer, transactionId: "REF-1" } }), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    await flushBackground();

    const emails = await renderSent();
    expect(emails).toHaveLength(1); // solo la clienta: el panel no se avisa a sí mismo
    expect(emails[0].to).toEqual([customer.email]);
    expect(emails[0].subject).toBe(`Tu pedido #${order.orderNumber} - Pago confirmado`);
    expectItems(emails[0], currencyFormatter);
  }, 30_000);

  it("«Enviado» from the panel has a Spanish subject and the items", async () => {
    const { currencyFormatter } = await import("@/lib/utils");
    const order = await seedOrder(OrderStatus.PAID);
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    const response = await PATCH(json("PATCH", { status: OrderStatus.SENT, expectedStatus: OrderStatus.PAID }), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    await flushBackground();

    const emails = await renderSent();
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe(`Tu pedido #${order.orderNumber} - Enviado`);
    expectItems(emails[0], currencyFormatter);
  }, 30_000);

  it("cancelling from the panel lists what was cancelled", async () => {
    const { currencyFormatter } = await import("@/lib/utils");
    const order = await seedOrder();
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    const response = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PENDING }), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    await flushBackground();

    const emails = await renderSent();
    expect(emails).toHaveLength(1);
    expect(emails[0].subject).toBe(`Tu pedido #${order.orderNumber} - Cancelada`);
    expectItems(emails[0], currencyFormatter);
  }, 30_000);

  it("deleting an order sends no email and logs no email error", async () => {
    const order = await seedOrder();
    errors = vi.spyOn(console, "error");
    const { DELETE } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    const response = await DELETE(json("DELETE", {}), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    await flushBackground();

    expect(resendSend).not.toHaveBeenCalled();
    expect(await testPrisma.failedNotification.count({ where: { orderId: order.id } })).toBe(0);
    expect(errors.mock.calls.filter((call) => /\[EMAIL\]|Cancellation email/.test(String(call[0])))).toEqual([]);
  }, 30_000);

  it("a panel status change to PENDING sends the email but creates no OrderAccountClaim (unchanged behaviour)", async () => {
    const order = await seedOrder(OrderStatus.DRAFT); // un borrador del panel que pasa a pendiente
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    const response = await PATCH(json("PATCH", { status: OrderStatus.PENDING, expectedStatus: OrderStatus.DRAFT }), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    await flushBackground();

    const emails = await renderSent();
    expect(emails.map((email) => email.subject)).toEqual([`Tu pedido #${order.orderNumber} - Pendiente de pago`]);
    expect(emails[0].text).not.toContain("guardar-pedido");
    expect(await testPrisma.orderAccountClaim.count({ where: { orderId: order.id } })).toBe(0);
  }, 30_000);

  it("an order with the placeholder address: the panel status change sends nothing to it and records no failure", async () => {
    const order = await seedOrder();
    await testPrisma.order.update({ where: { id: order.id }, data: { email: "ClientesVarios@gmail.com" } });
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");

    const response = await PATCH(json("PATCH", { status: OrderStatus.CANCELLED, expectedStatus: OrderStatus.PENDING }), { params: { storeId: fixture!.store.id, orderId: order.id } });
    expect(response.status).toBe(200);
    await flushBackground();

    expect(resendSend).not.toHaveBeenCalled(); // el panel no se avisa a sí mismo y la clienta es de relleno
    expect(await testPrisma.failedNotification.count({ where: { orderId: order.id } })).toBe(0);
  }, 30_000);

  it("the email reads the order from the database, so it has the items even when the caller has none", async () => {
    const { currencyFormatter } = await import("@/lib/utils");
    const order = await seedOrder(OrderStatus.PAID);
    const { sendOrderEmail } = await import("@/lib/email");

    await sendOrderEmail(order.id, OrderStatus.PAID);

    const emails = await renderSent();
    expect(emails.map((email) => email.subject).sort()).toEqual(
      [`Tu pedido #${order.orderNumber} - Pago confirmado`, `[Admin] Pedido #${order.orderNumber} - Pago confirmado`].sort(),
    );
    for (const email of emails) expectItems(email, currencyFormatter);
  }, 30_000);
});
