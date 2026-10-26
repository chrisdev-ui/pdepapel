import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { OrderSource, OrderStatus, OrderType, PaymentMethod, ShippingProvider, ShippingStatus } from "@prisma/client";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Desde 2026-10-26 la tienda solo pide la cédula a quien quiere factura a su
 * nombre, así que la mayoría de los pedidos llegan sin documento. EnvioClick
 * no tiene ningún campo de identificación en /shipment ni en /quotation
 * (apidoc.envioclickpro.com.co, api_data.json), tampoco para contra entrega:
 * la guía tiene que salir igual, prepagada o contra entrega.
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

const CUSTOMER = { fullName: "Clienta Sin Factura", phone: "+573001234567", email: "clienta@prueba.test", address: "Calle 1 # 2-3", city: "Medellín", department: "Antioquia", daneCode: "05001000", neighborhood: "Centro" };
const RATE = { idRate: 880001, carrier: "COORDINADORA", product: "Normal", flete: 9000, minimumInsurance: 500, totalCost: 9500, deliveryDays: 2 };
const DOCUMENT_KEYS = /identif|document|\bdni\b|\bnit\b|cedula|cédula|idNumber/i;

function keysDeep(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, inner]) => [`${prefix}${key}`, ...keysDeep(inner, `${prefix}${key}.`)]);
}

async function orderWithoutDocument(
  f: InventoryFixture,
  { cod, documentId }: { cod: boolean; documentId: string | null },
) {
  return testPrisma.order.create({
    data: {
      storeId: f.store.id,
      orderNumber: `ORD-TEST-${randomUUID()}`,
      status: cod ? OrderStatus.PENDING : OrderStatus.PAID,
      ...(cod ? {} : { paidAt: new Date() }),
      type: OrderType.STANDARD,
      source: OrderSource.STORE,
      ...CUSTOMER,
      documentId,
      subtotal: 10000,
      total: 10000 + RATE.totalCost,
      orderItems: { create: [{ productId: f.component.id, name: f.component.name, quantity: 1, price: 10000 }] },
      payment: { create: { storeId: f.store.id, method: cod ? PaymentMethod.COD : PaymentMethod.Bold } },
      shipping: {
        create: {
          storeId: f.store.id,
          provider: ShippingProvider.ENVIOCLICK,
          status: ShippingStatus.Preparing,
          isCOD: cod,
          envioClickIdRate: RATE.idRate,
          carrierName: RATE.carrier,
          courier: RATE.carrier,
          productName: RATE.product,
          flete: RATE.flete,
          minimumInsurance: RATE.minimumInsurance,
          deliveryDays: RATE.deliveryDays,
          cost: RATE.totalCost,
        },
      },
    },
  });
}

const request = () => new Request("http://admin.test/api/x", { method: "POST" });

describe("guía de EnvioClick para un pedido sin documento", () => {
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

  for (const scenario of [
    { name: "prepagada (Bold), documento null", cod: false, documentId: null },
    { name: "prepagada (Bold), documento vacío", cod: false, documentId: "" },
    { name: "contra entrega, documento null", cod: true, documentId: null },
  ]) {
    it(`se crea igual: ${scenario.name}`, async () => {
      const f = await createInventoryFixture();
      fixture = f;
      session.userId = f.store.userId;
      const order = await orderWithoutDocument(f, scenario);

      envioclick.createShipment.mockResolvedValue({
        data: { idOrder: 990, tracker: "GUIA990", url: "https://guia.test/990", guide: "", requestPickup: true, external_order_id: "x", origin: {}, destination: {} },
      });
      const { POST } = await import("@/app/api/[storeId]/orders/[orderId]/shipping/create-guide/route");
      const response = await POST(request(), { params: { storeId: f.store.id, orderId: order.id } });
      expect(response.status).toBe(200);

      expect(envioclick.createShipment).toHaveBeenCalledTimes(1);
      const payload = envioclick.createShipment.mock.calls[0][0];
      // Nada del documento viaja a la transportadora, ni hace falta.
      expect(keysDeep(payload).filter((key) => DOCUMENT_KEYS.test(key))).toEqual([]);
      expect(payload.destination).toMatchObject({ daneCode: CUSTOMER.daneCode, firstName: expect.any(String), phone: expect.any(String) });
      if (scenario.cod) {
        expect(payload).toMatchObject({ idRate: RATE.idRate, codValue: Number(order.total), codPaymentMethod: "cash" });
      } else {
        expect(payload).not.toHaveProperty("codValue");
      }

      const shipping = await testPrisma.shipping.findFirstOrThrow({ where: { orderId: order.id } });
      expect(shipping).toMatchObject({ envioClickIdOrder: 990, trackingCode: "GUIA990", guideError: null });
    });
  }
});
