import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * ORD-1791998787841-915 (2026-10-15): pedido contra entrega pendiente, envío
 * contra entrega SIN tarifa guardada (precio 0, lo dejó así la reversión del
 * pago) y un intento de guía fallido de antes. Paula cotiza con recaudo,
 * elige ENVIA y crea la guía: el pedido guarda idRate, precio y contra
 * entrega de esa tarifa, y la guía va a EnvioClick con ESE idRate y el valor
 * a recaudar.
 */
const session = vi.hoisted(() => ({ userId: null as string | null }));
const envioclick = vi.hoisted(() => ({ createShipment: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: session.userId }),
  clerkClient: async () => ({ users: { getUser: vi.fn().mockResolvedValue(null) } }),
}));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn().mockResolvedValue(undefined), sendShippingEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/google-analytics", async (importOriginal) => ({ ...(await importOriginal<object>()), recordPaidOrderInGoogleAnalytics: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/cache", () => ({
  storefrontScopeOf: vi.fn().mockResolvedValue(null),
  revalidateStorefrontFor: vi.fn().mockResolvedValue(undefined),
  invalidateStoreProductsCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/revalidate-store", () => ({ triggerStorefrontRevalidation: vi.fn().mockResolvedValue(undefined), revalidateStorefront: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/envioclick", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/envioclick")>();
  return { ...actual, envioClickClient: { createShipment: envioclick.createShipment } };
});
vi.mock("@/lib/resource-lock", () => ({
  withResourceLock: (_key: string, _message: string, run: () => Promise<unknown>) => run(),
  ResourceBusyError: class ResourceBusyError extends Error {},
}));

const CUSTOMER = { fullName: "Clienta Contra Entrega", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "La Dorada", department: "Caldas", daneCode: "17380000", neighborhood: "Centro" };
/** La tarifa ENVIA con recaudo que devolvió EnvioClick a las 21:10:26 UTC. */
const COD_RATE = { idRate: 777001, carrier: "ENVIA", product: "Normal", flete: 18074, minimumInsurance: 0, totalCost: 18074, deliveryDays: 3, codCost: 8391 };
const request = (method: string, body?: unknown) =>
  new Request("http://admin.test/api/x", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

describe("guardar la tarifa contra entrega y crear la guía", () => {
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

  it("precio 0 + cotización con recaudo → guardar → la guía lleva el idRate contra entrega", async () => {
    const f = await createInventoryFixture();
    fixture = f;
    session.userId = f.store.userId;
    const order = await testPrisma.order.create({
      data: {
        storeId: f.store.id,
        orderNumber: `ORD-TEST-${randomUUID()}`,
        status: OrderStatus.PENDING,
        type: OrderType.STANDARD,
        source: OrderSource.STORE,
        ...CUSTOMER,
        subtotal: 10000,
        total: 10000,
        orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
        payment: { create: { storeId: f.store.id, method: PaymentMethod.COD } },
        shipping: {
          create: {
            storeId: f.store.id,
            provider: ShippingProvider.ENVIOCLICK,
            status: ShippingStatus.Preparing,
            isCOD: true,
            guideError: "La cotización de envío ha expirado o es inválida. Error: Este no es un idRate válido para COD.",
            guideAttemptedAt: new Date(Date.now() - 3 * 3600_000),
          },
        },
      },
    });

    // Lo que manda «Guardar» del panel después de elegir la tarifa con recaudo.
    const { PATCH } = await import("@/app/api/[storeId]/orders/[orderId]/route");
    const saved = await PATCH(
      request("PATCH", {
        ...CUSTOMER,
        expectedStatus: OrderStatus.PENDING,
        skipAutoGuide: true,
        orderItems: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }],
        payment: { method: PaymentMethod.COD },
        shippingProvider: ShippingProvider.ENVIOCLICK,
        envioClickIdRate: COD_RATE.idRate,
        shipping: {
          status: ShippingStatus.Preparing,
          carrierName: COD_RATE.carrier,
          courier: COD_RATE.carrier,
          productName: COD_RATE.product,
          flete: COD_RATE.flete,
          minimumInsurance: COD_RATE.minimumInsurance,
          deliveryDays: COD_RATE.deliveryDays,
          isCOD: true,
          cost: COD_RATE.totalCost,
        },
      }),
      { params: { storeId: f.store.id, orderId: order.id } },
    );
    expect(saved.status).toBe(200);
    const shipping = await testPrisma.shipping.findFirstOrThrow({ where: { orderId: order.id } });
    expect(shipping).toMatchObject({ envioClickIdRate: COD_RATE.idRate, carrierName: "ENVIA", cost: COD_RATE.totalCost, isCOD: true });
    const total = (await testPrisma.order.findUniqueOrThrow({ where: { id: order.id } })).total;
    expect(total).toBe(10000 + COD_RATE.totalCost);

    envioclick.createShipment.mockResolvedValue({
      data: { idOrder: 555, tracker: "GUIA555", url: "https://guia.test/555", guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} },
    });
    const guideRoute = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
    const guide = await guideRoute.POST(request("POST"), { params: { storeId: f.store.id, orderId: order.id } });
    expect(guide.status).toBe(200);

    expect(envioclick.createShipment).toHaveBeenCalledTimes(1);
    const payload = envioclick.createShipment.mock.calls[0][0];
    expect(payload).toMatchObject({ idRate: COD_RATE.idRate, codValue: total, codPaymentMethod: "cash" });

    const after = await testPrisma.shipping.findFirstOrThrow({ where: { orderId: order.id } });
    expect(after).toMatchObject({ envioClickIdOrder: 555, trackingCode: "GUIA555", guideError: null, guideAttemptedAt: null });
  });
});
