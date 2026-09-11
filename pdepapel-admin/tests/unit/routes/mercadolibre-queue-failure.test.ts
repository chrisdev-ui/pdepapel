import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  parse: vi.fn(),
  webhookUpdateMany: vi.fn(),
  outboxUpdateMany: vi.fn(),
  connectionUpdateMany: vi.fn(),
}));

vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreFailureUrl: () => "https://admin.test/api/internal/marketplaces/mercadolibre/failure",
  parseMercadoLibreQueueFailureCallback: mocks.parse,
  verifyMercadoLibreProcessorRequest: mocks.verify,
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({ MAX_OUTBOX_EVENT_ATTEMPTS: 12 }));
vi.mock("@/lib/mercadolibre/webhook-processor", () => ({ MAX_WEBHOOK_EVENT_ATTEMPTS: 12 }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceWebhookEvent: { updateMany: mocks.webhookUpdateMany },
    marketplaceOutboxEvent: { updateMany: mocks.outboxUpdateMany },
    marketplaceConnection: { updateMany: mocks.connectionUpdateMany },
  },
}));

import { POST } from "@/app/api/internal/marketplaces/mercadolibre/failure/route";

function request() {
  return new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({}),
    headers: { "upstash-signature": "sig" },
  });
}

describe("POST /internal/marketplaces/mercadolibre/failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.parse.mockReturnValue({ kind: "webhook", eventId: "event-1", message: "timeout" });
  });

  it("marks an exhausted webhook event FAILED instead of re-queueing it forever", async () => {
    mocks.webhookUpdateMany.mockResolvedValueOnce({ count: 1 });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.webhookUpdateMany).toHaveBeenCalledTimes(1);
    expect(mocks.webhookUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "event-1", attempts: { gte: 12 } }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("returns a webhook event with attempts left to RETRY", async () => {
    mocks.webhookUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await POST(request());
    expect(mocks.webhookUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.webhookUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RETRY" }) }),
    );
  });

  it("never fails a pending settlement job, only re-opens it", async () => {
    mocks.parse.mockReturnValue({ kind: "stock-sync", eventId: "fin-1", message: "timeout" });
    mocks.outboxUpdateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await POST(request());
    expect(mocks.outboxUpdateMany.mock.calls[0][0].where).toMatchObject({
      action: { not: "SYNC_ORDER_FINANCIALS" },
      attempts: { gte: 12 },
    });
    expect(mocks.outboxUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "RETRY" }) }),
    );
  });
});
