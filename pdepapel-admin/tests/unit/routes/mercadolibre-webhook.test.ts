import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findFirst: mocks.findFirst },
    marketplaceWebhookEvent: { upsert: mocks.upsert },
  },
}));

import { POST } from "@/app/api/webhook/mercadolibre/route";

describe("Mercado Libre webhook route", () => {
  it("persists an event and acknowledges it without processing the sale inline", async () => {
    mocks.findFirst.mockResolvedValue({ id: "connection-id" });
    mocks.upsert.mockResolvedValue({
      id: "event-id",
      connectionId: "connection-id",
    });

    const response = await POST(
      new Request("https://admin.example.com/api/webhook/mercadolibre", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          _id: "notification-id",
          topic: "orders_v2",
          resource: "/orders/2000001",
          user_id: 123,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      eventId: "event-id",
      connectedSeller: true,
      queued: false,
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          eventKey: "notification-id",
          topic: "orders_v2",
          resource: "/orders/2000001",
        }),
      }),
    );
  });
});
