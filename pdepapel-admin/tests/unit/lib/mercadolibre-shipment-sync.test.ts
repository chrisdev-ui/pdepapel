import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  getJson: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceOrder: { findFirst: mocks.findFirst },
    marketplaceShipment: { upsert: mocks.upsert },
  },
}));
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreJson: mocks.getJson,
}));

import {
  getMercadoLibreShipmentOrderIds,
  synchronizeMercadoLibreShipment,
} from "@/lib/mercadolibre/logistics";

describe("Mercado Libre shipment synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links a shipment to its local sale through Mercado Libre shipment items", async () => {
    mocks.getJson.mockResolvedValue([
      { item_id: "MCO123", order_id: 2000017813937484 },
    ]);
    mocks.findFirst.mockResolvedValue({ id: "marketplace-order-id" });
    mocks.upsert.mockResolvedValue({ id: "shipment-record-id" });

    await synchronizeMercadoLibreShipment("connection-id", {
      id: 47712931618,
      status: "ready_to_ship",
      substatus: "dropped_off",
    });

    expect(mocks.getJson).toHaveBeenCalledWith(
      "connection-id",
      "/shipments/47712931618/items",
    );
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        connectionId: "connection-id",
        externalOrderId: "2000017813937484",
      },
      select: { id: true },
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          marketplaceOrderId: "marketplace-order-id",
          metadata: expect.objectContaining({
            externalOrderIds: ["2000017813937484"],
          }),
        }),
        create: expect.objectContaining({
          marketplaceOrderId: "marketplace-order-id",
        }),
      }),
    );
  });

  it("does not guess a local sale when a package has multiple orders", async () => {
    mocks.getJson.mockResolvedValue([
      { item_id: "MCO123", order_id: 2000017813937484 },
      { item_id: "MCO456", order_id: 2000017813937485 },
    ]);
    mocks.upsert.mockResolvedValue({ id: "shipment-record-id" });

    await synchronizeMercadoLibreShipment("connection-id", {
      id: 47712931618,
      status: "ready_to_ship",
    });

    const call = mocks.upsert.mock.calls[0][0];
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(call.update).not.toHaveProperty("marketplaceOrderId");
    expect(call.create.marketplaceOrderId).toBeNull();
    expect(call.update.metadata).toMatchObject({
      externalOrderIds: ["2000017813937484", "2000017813937485"],
    });
  });

  it("accepts both documented shipment-items response shapes", () => {
    expect(
      getMercadoLibreShipmentOrderIds({
        items: [{ order_id: 2000017813937484 }],
      }),
    ).toEqual(["2000017813937484"]);
  });
});
