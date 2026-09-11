import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUpdatedOrder: vi.fn(),
  sendShippingEmail: vi.fn(),
  createOrphanEvent: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({
  env: { ENVIOCLICK_WEBHOOK_SECRET: "secreto-de-pruebas-envioclick-1234" },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    $transaction: mocks.transaction,
    order: { findUnique: mocks.findUpdatedOrder },
    shippingWebhookEvent: { create: mocks.createOrphanEvent },
  },
}));
vi.mock("@/lib/email", () => ({ sendShippingEmail: mocks.sendShippingEmail }));

import { GET, POST } from "@/app/api/webhook/envioclick/route";

const SECRET = "secreto-de-pruebas-envioclick-1234";
const url = (query = "") => `https://admin.example.com/api/webhook/envioclick${query}`;

const post = (payload: unknown, query = `?token=${SECRET}`, headers: Record<string, string> = {}) =>
  POST(
    new Request(url(query), {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(payload),
    }),
  );

const shippingRow = {
  id: "shipping-id",
  orderId: "order-id",
  storeId: "store-id",
  status: "Preparing",
  trackingCode: "OLD-TRACK",
  notes: "Llamar al portero antes de entregar",
  pickupDate: null,
  estimatedDeliveryDate: null,
  actualDeliveryDate: null,
  order: { id: "order-id", storeId: "store-id" },
};

function txClient(shipping: any = shippingRow) {
  return {
    shipping: {
      findFirst: vi.fn().mockResolvedValue(shipping),
      update: vi.fn().mockResolvedValue({}),
    },
    order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    shippingTrackingEvent: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

describe("POST /api/webhook/envioclick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUpdatedOrder.mockResolvedValue(null);
  });

  it("rejects a request without the shared secret before touching the database", async () => {
    const response = await post({ idOrder: 1 }, "");

    expect(response.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret, from the query or the header", async () => {
    expect((await post({ idOrder: 1 }, "?token=incorrecto")).status).toBe(401);
    expect(
      (await post({ idOrder: 1 }, "", { "x-webhook-token": "incorrecto" })).status,
    ).toBe(401);
  });

  it("accepts the secret in the header too", async () => {
    const tx = txClient();
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    const response = await post({ idOrder: 1, events: [] }, "", { "x-webhook-token": SECRET });

    expect(response.status).toBe(200);
  });

  it("does not accept a payload without any identifier", async () => {
    const response = await post({ events: [] });

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("answers 400 to an unreadable date instead of crashing with a 500", async () => {
    const response = await post({ idOrder: 1, realPickupDate: "ayer", events: [] });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("realPickupDate"),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the store when the configured URL carries one", async () => {
    const tx = txClient();
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    await post({ idOrder: 132456, events: [] }, `?token=${SECRET}&store=store-id`);

    expect(tx.shipping.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-id",
          OR: [{ envioClickIdOrder: 132456 }],
        }),
      }),
    );
  });

  it("never overwrites the team's shipping notes", async () => {
    const tx = txClient();
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    await post({
      idOrder: 132456,
      trackingCode: "NEW-TRACK",
      events: [
        { statusStep: "Entregado", timestamp: "2026-09-10T10:00:00Z", receivedBy: "Portería" },
      ],
    });

    const data = tx.shipping.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("notes");
    expect(data.trackingCode).toBe("NEW-TRACK");
    expect(data.status).toBe("Delivered");
  });

  it("moves the order to sent only within its own store", async () => {
    const tx = txClient();
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    await post({
      idOrder: 132456,
      events: [{ statusStep: "En tránsito", timestamp: "2026-09-10T10:00:00Z" }],
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-id", storeId: "store-id" },
      data: { status: "SENT" },
    });
  });

  it("acknowledges an unknown shipment with 200 so the provider stops retrying, but keeps the payload", async () => {
    mocks.transaction.mockResolvedValue({ type: "NOT_FOUND" });
    mocks.createOrphanEvent.mockResolvedValue({});

    const response = await post({ idOrder: 999999, events: [] });

    expect(response.status).toBe(200);
    expect(mocks.createOrphanEvent).toHaveBeenCalledWith({
      data: expect.objectContaining({ idOrder: "999999", reason: "shipping_not_found", payload: expect.objectContaining({ idOrder: 999999 }) }),
    });
  });

  it("still answers 200 when the orphan payload cannot be stored", async () => {
    mocks.transaction.mockResolvedValue({ type: "NOT_FOUND" });
    mocks.createOrphanEvent.mockRejectedValue(new Error("db down"));

    expect((await post({ myShipmentReference: "ORD-X", events: [] })).status).toBe(200);
  });
});

describe("GET /api/webhook/envioclick", () => {
  it("does not confirm the endpoint to an unauthenticated caller", async () => {
    expect((await GET(new Request(url()))).status).toBe(401);
    expect((await GET(new Request(url(`?token=${SECRET}`)))).status).toBe(200);
  });
});
