import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUpdatedOrder: vi.fn(),
  queueShipmentStatusChange: vi.fn(),
  createOrphanEvent: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({
  env: { ENVIOCLICK_WEBHOOK_SECRET: "secreto-de-pruebas-envioclick-1234" },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    $transaction: mocks.transaction,
    order: { findUnique: mocks.findUpdatedOrder },
    shippingWebhookEvent: { create: mocks.createOrphanEvent, findFirst: vi.fn().mockResolvedValue(null) },
  },
}));
vi.mock("@/lib/shipment-notifications", () => ({ queueShipmentStatusChange: mocks.queueShipmentStatusChange }));

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
  order: { id: "order-id", storeId: "store-id", status: "PAID", type: "STANDARD", payment: { method: "BankTransfer" } },
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

  it("asks the notifier for the new milestone after the update commits", async () => {
    const tx = txClient();
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));
    mocks.findUpdatedOrder.mockResolvedValue({ id: "order-id", storeId: "store-id" });

    await post({
      idOrder: 132456,
      events: [{ statusStep: "Entregado", timestamp: "2026-09-10T10:00:00Z" }],
    });
    await new Promise((resolve) => setImmediate(resolve));

    // El notificador carga el pedido con sus artículos y avisa una sola vez (lib/shipment-notifications.ts).
    expect(mocks.queueShipmentStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: expect.any(String), next: "Delivered", source: "webhook EnvioClick" }),
    );
  });

  it("«Pendiente de recolección» after a panel guide keeps the shipment as Shipped", async () => {
    const tx = txClient({ ...shippingRow, status: "Shipped" });
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    await post({
      idOrder: 132456,
      events: [{ statusStep: "Pendiente de recolección", timestamp: "2026-09-10T10:00:00Z" }],
    });

    expect(mocks.queueShipmentStatusChange).toHaveBeenCalledWith(expect.objectContaining({ previous: "Shipped", next: "Shipped" }));
  });

  it("moves the order to sent only within its own store", async () => {
    const tx = txClient();
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    await post({
      idOrder: 132456,
      events: [{ statusStep: "En tránsito", timestamp: "2026-09-10T10:00:00Z" }],
    });

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-id", storeId: "store-id", status: "PAID" },
      data: { status: "SENT" },
    });
  });

  it("never revives a cancelled order from a late carrier event", async () => {
    const tx = txClient({ ...shippingRow, order: { ...shippingRow.order, status: "CANCELLED" } });
    mocks.transaction.mockImplementation(async (cb: any) => cb(tx));

    await post({
      idOrder: 132456,
      events: [{ statusStep: "Entregado", timestamp: "2026-09-10T10:00:00Z" }],
    });

    expect(tx.shipping.update).toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
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

describe("una guía hecha fuera del panel no cae en un pedido cualquiera", () => {
  beforeEach(() => vi.clearAllMocks());

  // Antes del 2026-09-10 el OR llevaba `{ myShipmentReference: undefined }`, que Prisma
  // trata como «sin condición»: los avisos de guías ajenas caían en el primer envío
  // (183 eventos en ORD-…-556, 71 en ORD-…-765).
  it.each([
    ["sin referencia", {}],
    ["referencia null", { myShipmentReference: null }],
    ["referencia vacía", { myShipmentReference: "" }],
  ])("%s: busca solo por idOrder", async (_label, extra) => {
    const tx = txClient(null);
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx));
    expect((await post({ idOrder: 4687105, events: [], ...extra })).status).toBe(200);
    const where = tx.shipping.findFirst.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ envioClickIdOrder: 4687105 }]);
    expect(JSON.stringify(where)).not.toContain("myShipmentReference");
  });

  it("idOrder null y sin referencia: no busca nada que pueda coincidir", async () => {
    const tx = txClient(null);
    mocks.transaction.mockImplementation(async (fn: (client: unknown) => unknown) => fn(tx));
    const response = await post({ idOrder: null, myShipmentReference: "", events: [] });
    expect(response.status).toBe(200);
    expect(tx.shipping.findFirst).not.toHaveBeenCalled();
  });
});

describe("GET /api/webhook/envioclick", () => {
  it("does not confirm the endpoint to an unauthenticated caller", async () => {
    expect((await GET(new Request(url()))).status).toBe(401);
    expect((await GET(new Request(url(`?token=${SECRET}`)))).status).toBe(200);
  });
});
