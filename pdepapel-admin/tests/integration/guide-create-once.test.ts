import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Una guía de EnvioClick se cobra al crearla (ORD-1793673348281-170, 2026-11-03: Paula pulsó
 * «Crear guía», la guía salió y la página siguió ofreciendo el botón). Con el candado de Redis caído
 * (aquí, un paso directo), la reserva en la fila del envío deja llegar a EnvioClick una sola petición.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const envioclick = vi.hoisted(() => ({ createShipment: vi.fn() }));
const milestones = vi.hoisted(() => ({ queue: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/envioclick", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/envioclick")>();
  return { ...actual, envioClickClient: { createShipment: envioclick.createShipment } };
});
vi.mock("@/lib/resource-lock", () => ({
  withResourceLock: (_key: string, _message: string, run: () => Promise<unknown>) => run(),
  ResourceBusyError: class ResourceBusyError extends Error {},
}));
vi.mock("@/lib/shipment-notifications", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shipment-notifications")>();
  return { ...actual, queueShipmentMilestone: milestones.queue, notifyShipmentMilestone: vi.fn() };
});

const request = () => new Request("http://admin.test/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const GUIDE = { data: { idOrder: 4823557, tracker: "034059511182", url: "https://guia.test/1", guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} } };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
}

async function until(check: () => boolean, ms = 5_000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("crear guía: una sola guía por pedido", () => {
  let fixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });
  afterEach(async () => {
    if (fixture) await deleteInventoryFixture(fixture);
    fixture = undefined;
    session.userId = null;
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  const paidOrder = async () => {
    const f = await createInventoryFixture();
    fixture = f;
    session.userId = f.store.userId;
    return testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PAID,
        paidAt: new Date(),
        type: OrderType.STANDARD,
        fullName: "Clienta Prueba",
        phone: "+573001234567",
        email: "clienta@prueba.test",
        address: "Calle 1 # 2-3",
        city: "Bogotá",
        department: "Bogotá D.C.",
        daneCode: "11001000",
        subtotal: 14000,
        total: 27997,
        orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 14000 }] },
        payment: { create: { storeId: f.store.id, method: PaymentMethod.Bold } },
        shipping: {
          create: { storeId: f.store.id, provider: ShippingProvider.ENVIOCLICK, status: ShippingStatus.Preparing, envioClickIdRate: 26689253, cost: 13997, flete: 13997 },
        },
      },
    });
  };

  const post = async (orderId: string) => {
    const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
    const response = await POST(request(), { params: { storeId: fixture!.store.id, orderId } });
    return { status: response.status, body: await response.json() };
  };

  it("una segunda petición mientras la primera espera a EnvioClick no llama otra vez: responde «ya se está creando»", async () => {
    const order = await paidOrder();
    const call = deferred<typeof GUIDE>();
    envioclick.createShipment.mockReturnValue(call.promise);

    const first = post(order.id);
    await until(() => envioclick.createShipment.mock.calls.length === 1);
    const second = await post(order.id);
    expect(second.status).toBe(409);
    expect(second.body.error).toContain("Ya se está creando la guía");

    call.resolve(GUIDE);
    const done = await first;
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ success: true, alreadyCreated: false, data: { idOrder: 4823557, tracker: "034059511182" } });
    expect(envioclick.createShipment).toHaveBeenCalledTimes(1);
    expect(milestones.queue).toHaveBeenCalledTimes(1);
  });

  it("dos peticiones a la vez: EnvioClick recibe una sola, queda una sola guía", async () => {
    const order = await paidOrder();
    const call = deferred<typeof GUIDE>();
    envioclick.createShipment.mockReturnValue(call.promise);

    const both = Promise.all([post(order.id), post(order.id)]);
    await until(() => envioclick.createShipment.mock.calls.length >= 1);
    await new Promise((r) => setTimeout(r, 200));
    call.resolve(GUIDE);
    const results = await both;

    expect(envioclick.createShipment).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const shipping = await testPrisma.shipping.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(shipping).toMatchObject({ envioClickIdOrder: 4823557, trackingCode: "034059511182", guideError: null, guideAttemptedAt: null });
    expect(milestones.queue).toHaveBeenCalledTimes(1);
  });

  it("repetirla después de crearla devuelve la guía que hay, sin llamar a EnvioClick ni volver a avisar", async () => {
    const order = await paidOrder();
    envioclick.createShipment.mockResolvedValue(GUIDE);
    expect((await post(order.id)).status).toBe(200);

    const again = await post(order.id);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ success: true, alreadyCreated: true, data: { idOrder: 4823557, tracker: "034059511182" } });
    expect(envioclick.createShipment).toHaveBeenCalledTimes(1);
    expect(milestones.queue).toHaveBeenCalledTimes(1);
  });

  it("un intento fallido libera la reserva: el siguiente intento sí llega a EnvioClick", async () => {
    const order = await paidOrder();
    envioclick.createShipment.mockRejectedValueOnce(
      Object.assign(new Error("EnvioClick API Error: NOT OK. Details: No tiene suficiente crédito disponible"), { reason: "insufficient_credit" }),
    );
    const failed = await post(order.id);
    expect(failed.status).toBeGreaterThanOrEqual(400);
    const afterFailure = await testPrisma.shipping.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(afterFailure.envioClickIdOrder).toBeNull();
    expect(afterFailure.guideError).toContain("suficiente crédito");

    envioclick.createShipment.mockResolvedValueOnce(GUIDE);
    const retried = await post(order.id);
    expect(retried.status).toBe(200);
    expect(envioclick.createShipment).toHaveBeenCalledTimes(2);
  });

  it("una reserva abandonada (función cortada) vence a los 5 minutos", async () => {
    const order = await paidOrder();
    await testPrisma.shipping.update({ where: { orderId: order.id }, data: { guideAttemptedAt: new Date(Date.now() - 60_000), guideError: null } });
    envioclick.createShipment.mockResolvedValue(GUIDE);
    expect((await post(order.id)).status).toBe(409);
    expect(envioclick.createShipment).not.toHaveBeenCalled();

    await testPrisma.shipping.update({ where: { orderId: order.id }, data: { guideAttemptedAt: new Date(Date.now() - 6 * 60_000) } });
    expect((await post(order.id)).status).toBe(200);
    expect(envioclick.createShipment).toHaveBeenCalledTimes(1);
  });
});
