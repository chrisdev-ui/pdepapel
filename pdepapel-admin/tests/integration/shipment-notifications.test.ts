import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus, WhatsAppOptInSource } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Los avisos de envío salen una vez por guía y hito, lo pida quien lo pida
 * (crear la guía, el webhook, «Reenviar»), y el WhatsApp solo con el
 * consentimiento del pedido y el interruptor encendido. Regresión del 26 oct:
 * crear una guía no avisaba a nadie.
 */
const sent = vi.hoisted(() => ({ email: vi.fn(), whatsapp: vi.fn() }));

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return { ...actual, sendShipmentMilestoneEmail: sent.email };
});
vi.mock("@/lib/whatsapp/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp/send")>();
  return { ...actual, sendWhatsAppTemplateMessage: sent.whatsapp };
});

import { notifyShipmentMilestone, retryShipmentMilestoneEmail } from "@/lib/shipment-notifications";

const CUSTOMER = { fullName: "Clienta Avisos", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000" };

let f: InventoryFixture;

beforeAll(async () => {
  f = await createInventoryFixture();
});
afterAll(async () => {
  await testPrisma.storeSettings.deleteMany({ where: { storeId: f.store.id } });
  await deleteInventoryFixture(f);
});
beforeEach(() => {
  sent.email.mockImplementation(async (_order: unknown, _milestone: unknown, roles: string[]) =>
    Object.fromEntries(roles.map((role) => [role, { ok: true, attempts: 1, id: `re_${role}` }])),
  );
  sent.whatsapp.mockResolvedValue({ ok: true, externalId: "wamid.prueba" });
});
afterEach(() => vi.clearAllMocks());

async function shippedOrder(overrides: { email?: string | null; status?: OrderStatus; tracking?: string | null; optIn?: boolean } = {}) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: overrides.status ?? OrderStatus.PAID,
      paidAt: new Date(),
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      ...CUSTOMER,
      email: overrides.email === undefined ? CUSTOMER.email : overrides.email,
      subtotal: 10000,
      total: 19500,
      ...(overrides.optIn ? { whatsappOptInAt: new Date(), whatsappOptInVersion: "2026-10-26", whatsappOptInSource: WhatsAppOptInSource.CHECKOUT } : {}),
      orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
      payment: { create: { storeId: f.store.id, method: PaymentMethod.Bold } },
      shipping: {
        create: {
          storeId: f.store.id,
          provider: ShippingProvider.ENVIOCLICK,
          status: ShippingStatus.Shipped,
          envioClickIdOrder: Math.floor(Math.random() * 1e8),
          trackingCode: overrides.tracking === undefined ? `TRK${randomUUID().slice(0, 8)}` : overrides.tracking,
          carrierName: "ENVIA",
        },
      },
    },
  });
}

const rows = (orderId: string) => testPrisma.orderNotification.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });

describe("avisos de envío", () => {
  it("guía creada: un correo a la clienta, sin copia a Paula, y queda en el historial", async () => {
    const order = await shippedOrder();
    const result = await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" });

    expect(result.email).toEqual({ customer: "SENT" });
    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(sent.email.mock.calls[0][2]).toEqual(["customer"]);
    const saved = await rows(order.id);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ channel: "EMAIL", role: "customer", milestone: "guia_creada", status: "SENT", providerMessageId: "re_customer" });
  });

  it("dos rutas a la vez (crear guía + webhook) mandan un solo correo", async () => {
    const order = await shippedOrder();
    const input = { orderId: order.id, storeId: f.store.id, milestone: "guia_creada" as const, source: "prueba" };
    const results = await Promise.all([notifyShipmentMilestone(input), notifyShipmentMilestone(input), notifyShipmentMilestone(input)]);

    expect(sent.email).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.email.customer === "duplicate")).toHaveLength(2);
    expect(await rows(order.id)).toHaveLength(1);
  });

  it("entregado copia a Paula; «Reenviar» manda otra vez con su propia fila", async () => {
    const order = await shippedOrder();
    await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "entregado", source: "prueba" });
    expect(sent.email.mock.calls[0][2]).toEqual(["customer", "admin"]);

    await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "entregado", source: "prueba" });
    expect(sent.email).toHaveBeenCalledTimes(1);

    await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "entregado", source: "panel", force: true, createdBy: "user_paula" });
    expect(sent.email).toHaveBeenCalledTimes(2);
    const saved = await rows(order.id);
    expect(saved).toHaveLength(4);
    expect(saved.filter((r) => r.createdBy === "user_paula")).toHaveLength(2);
  });

  it("sin correo de la clienta queda SKIPPED; cancelado o sin guía no avisa nada", async () => {
    sent.email.mockImplementationOnce(async () => ({ customer: null }));
    const noEmail = await shippedOrder({ email: null });
    await notifyShipmentMilestone({ orderId: noEmail.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" });
    expect((await rows(noEmail.id))[0]).toMatchObject({ status: "SKIPPED" });

    const cancelled = await shippedOrder({ status: OrderStatus.CANCELLED });
    expect((await notifyShipmentMilestone({ orderId: cancelled.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" })).skipped).toBe("pedido cancelado");
    const noGuide = await shippedOrder({ tracking: null });
    expect((await notifyShipmentMilestone({ orderId: noGuide.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" })).skipped).toBe("sin guía");
    expect(await rows(cancelled.id)).toHaveLength(0);
  });

  it("un pedido de otra tienda no se avisa", async () => {
    const order = await shippedOrder();
    const result = await notifyShipmentMilestone({ orderId: order.id, storeId: "otra-tienda", milestone: "guia_creada", source: "prueba" });
    expect(result.skipped).toBe("pedido no encontrado");
    expect(sent.email).not.toHaveBeenCalled();
  });

  it("correo que falló: el reintento lo manda y la fila pasa a SENT", async () => {
    sent.email.mockImplementationOnce(async () => ({ customer: { ok: false, attempts: 3, error: "rate_limit_exceeded", retryable: true } }));
    const order = await shippedOrder();
    await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "en_camino", source: "prueba" });
    expect((await rows(order.id))[0]).toMatchObject({ status: "FAILED", reason: "rate_limit_exceeded" });

    const outcomes = await retryShipmentMilestoneEmail(order.id, "en_camino", ["customer"]);
    expect(outcomes.customer?.ok).toBe(true);
    expect((await rows(order.id))[0]).toMatchObject({ status: "SENT", reason: null });
  });

  describe("WhatsApp", () => {
    beforeAll(async () => {
      await testPrisma.storeSettings.upsert({
        where: { storeId: f.store.id },
        create: { storeId: f.store.id, whatsappOrderUpdatesEnabled: true, whatsappTemplateGuide: "guia_creada", whatsappTemplateDelivered: "pedido_entregado" },
        update: { whatsappOrderUpdatesEnabled: true, whatsappTemplateGuide: "guia_creada", whatsappTemplateDelivered: "pedido_entregado" },
      });
    });

    it("sin consentimiento no sale WhatsApp (el correo sí)", async () => {
      const order = await shippedOrder({ optIn: false });
      const result = await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" });
      expect(result.email.customer).toBe("SENT");
      expect(result.whatsapp).toBe("not_applicable");
      expect(sent.whatsapp).not.toHaveBeenCalled();
    });

    it("con consentimiento sale una vez con la plantilla y sus variables", async () => {
      const order = await shippedOrder({ optIn: true });
      const input = { orderId: order.id, storeId: f.store.id, milestone: "guia_creada" as const, source: "prueba" };
      await Promise.all([notifyShipmentMilestone(input), notifyShipmentMilestone(input)]);
      expect(sent.whatsapp).toHaveBeenCalledTimes(1);
      const [to, template] = sent.whatsapp.mock.calls[0];
      expect(to).toBe("573001234567");
      expect(template).toMatchObject({ name: "guia_creada", language: "es_CO", buttonUrlSuffix: order.id });
      expect(template.bodyParams).toEqual(["Clienta", order.orderNumber, "ENVIA", expect.stringMatching(/^TRK/)]);
      expect((await rows(order.id)).find((r) => r.channel === "WHATSAPP")).toMatchObject({ status: "SENT", providerMessageId: "wamid.prueba" });
    });

    it("con la baja, o con el interruptor apagado, no sale; los hitos sin plantilla tampoco", async () => {
      const optedOut = await shippedOrder({ optIn: true });
      await testPrisma.order.update({ where: { id: optedOut.id }, data: { whatsappOptOutAt: new Date() } });
      expect((await notifyShipmentMilestone({ orderId: optedOut.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" })).whatsapp).toBe("not_applicable");

      const inTransit = await shippedOrder({ optIn: true });
      expect((await notifyShipmentMilestone({ orderId: inTransit.id, storeId: f.store.id, milestone: "en_camino", source: "prueba" })).whatsapp).toBe("not_applicable");

      await testPrisma.storeSettings.update({ where: { storeId: f.store.id }, data: { whatsappOrderUpdatesEnabled: false } });
      const off = await shippedOrder({ optIn: true });
      expect((await notifyShipmentMilestone({ orderId: off.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" })).whatsapp).toBe("not_applicable");
      expect(sent.whatsapp).not.toHaveBeenCalled();
    });

    it("un rechazo de Meta queda FAILED con el código y no se reintenta", async () => {
      await testPrisma.storeSettings.update({ where: { storeId: f.store.id }, data: { whatsappOrderUpdatesEnabled: true } });
      sent.whatsapp.mockResolvedValueOnce({ ok: false, error: "Template not found", code: 132001, retryable: false });
      const order = await shippedOrder({ optIn: true });
      expect((await notifyShipmentMilestone({ orderId: order.id, storeId: f.store.id, milestone: "guia_creada", source: "prueba" })).whatsapp).toBe("FAILED");
      expect((await rows(order.id)).find((r) => r.channel === "WHATSAPP")?.reason).toBe("(#132001) Template not found");
    });
  });
});
