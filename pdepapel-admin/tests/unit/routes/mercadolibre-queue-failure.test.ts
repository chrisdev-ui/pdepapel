import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outboxUpdateMany: vi.fn(),
  parseFailure: vi.fn(),
  verifyRequest: vi.fn(),
  webhookUpdateMany: vi.fn(),
}));

vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreFailureUrl: () =>
    "https://admin.example.com/api/internal/marketplaces/mercadolibre/failure",
  parseMercadoLibreQueueFailureCallback: mocks.parseFailure,
  verifyMercadoLibreProcessorRequest: mocks.verifyRequest,
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { updateMany: vi.fn() },
    marketplaceOutboxEvent: { updateMany: mocks.outboxUpdateMany },
    marketplaceWebhookEvent: { updateMany: mocks.webhookUpdateMany },
  },
}));

import { POST } from "@/app/api/internal/marketplaces/mercadolibre/failure/route";

describe("Mercado Libre QStash failure callback", () => {
  it("records an exhausted webhook job for safe recovery", async () => {
    mocks.verifyRequest.mockResolvedValue(true);
    mocks.parseFailure.mockReturnValue({
      kind: "webhook",
      eventId: "event-id",
      message: "QStash no pudo entregar una tarea de Mercado Libre",
    });
    mocks.webhookUpdateMany.mockResolvedValue({ count: 1 });

    const response = await POST(
      new Request(
        "https://admin.example.com/api/internal/marketplaces/mercadolibre/failure",
        {
          method: "POST",
          headers: { "upstash-signature": "signature" },
          body: JSON.stringify({ sourceBody: "ignored-by-mock" }),
        },
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      received: true,
      kind: "webhook",
    });
    expect(mocks.webhookUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "event-id" }),
        data: expect.objectContaining({ status: "RETRY" }),
      }),
    );
  });

  it("rejects unsigned failure callbacks", async () => {
    mocks.verifyRequest.mockResolvedValue(false);

    const response = await POST(
      new Request(
        "https://admin.example.com/api/internal/marketplaces/mercadolibre/failure",
        { method: "POST", body: "{}" },
      ),
    );

    expect(response.status).toBe(401);
  });
});
