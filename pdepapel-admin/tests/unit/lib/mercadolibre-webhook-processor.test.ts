import { MarketplaceWebhookEventStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findEvent: vi.fn(),
  claim: vi.fn(),
  update: vi.fn(),
  findMany: vi.fn(),
  getResource: vi.fn(),
  synchronize: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceWebhookEvent: {
      findUnique: mocks.findEvent,
      updateMany: mocks.claim,
      update: mocks.update,
      findMany: mocks.findMany,
    },
  },
}));
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));
vi.mock("@/lib/mercadolibre/client", () => ({ getMercadoLibreResource: mocks.getResource }));
vi.mock("@/lib/mercadolibre/logistics", () => ({
  synchronizeMercadoLibreClaim: vi.fn(),
  synchronizeMercadoLibreShipment: vi.fn(),
}));
vi.mock("@/lib/mercadolibre/questions", () => ({ synchronizeMercadoLibreQuestion: vi.fn() }));
vi.mock("@/lib/mercadolibre/order-sync", () => ({ synchronizeMercadoLibreOrder: mocks.synchronize }));
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreWebhookEvent: mocks.enqueue }));

import {
  MAX_WEBHOOK_EVENT_ATTEMPTS,
  processMercadoLibreWebhookEvent,
  recoverMercadoLibreWebhookEvents,
} from "@/lib/mercadolibre/webhook-processor";

function event(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    connectionId: "conn-1",
    topic: "orders_v2",
    resource: "/orders/2000017813937484",
    status: MarketplaceWebhookEventStatus.PENDING,
    attempts: 0,
    nextRetryAt: null,
    connection: { storeId: "store-1" },
    ...overrides,
  };
}

describe("processMercadoLibreWebhookEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.update.mockResolvedValue({});
    mocks.getResource.mockResolvedValue({ id: "2000017813937484" });
    mocks.synchronize.mockResolvedValue({ inventoryChanged: false, needsAttention: false });
  });

  it("processes a due event and marks it PROCESSED", async () => {
    mocks.findEvent.mockResolvedValue(event());
    await expect(processMercadoLibreWebhookEvent("event-1")).resolves.toEqual({
      processed: true,
      reason: "processed",
    });
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: expect.any(Date) } }],
        }),
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
  });

  it("honours nextRetryAt: an early redelivery is answered without touching the event", async () => {
    mocks.findEvent.mockResolvedValue(
      event({ status: "RETRY", nextRetryAt: new Date(Date.now() + 4 * 60 * 1000) }),
    );
    await expect(processMercadoLibreWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "not_due",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.getResource).not.toHaveBeenCalled();
  });

  it("schedules a retry with a future nextRetryAt instead of throwing", async () => {
    mocks.findEvent.mockResolvedValue(event({ attempts: 2 }));
    mocks.getResource.mockRejectedValueOnce(new Error("Mercado Libre respondió 429"));
    await expect(processMercadoLibreWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "retry_scheduled",
    });
    const call = mocks.update.mock.calls[0][0];
    expect(call.data.status).toBe("RETRY");
    expect(call.data.nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 4 * 60 * 1000);
    expect(call.data.lastError).toContain("429");
  });

  it("moves the event to FAILED once the attempts are exhausted", async () => {
    mocks.findEvent.mockResolvedValue(event({ status: "RETRY", attempts: MAX_WEBHOOK_EVENT_ATTEMPTS - 1 }));
    mocks.getResource.mockRejectedValueOnce(new Error("La orden de Mercado Libre no contiene productos"));
    await expect(processMercadoLibreWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "failed",
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          nextRetryAt: null,
          lastError: expect.stringContaining("Se agotaron los 12 intentos"),
        }),
      }),
    );
  });

  it("never re-runs a FAILED event", async () => {
    mocks.findEvent.mockResolvedValue(event({ status: "FAILED" }));
    await expect(processMercadoLibreWebhookEvent("event-1")).resolves.toEqual({
      processed: false,
      reason: "failed",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});

describe("recoverMercadoLibreWebhookEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claim.mockResolvedValue({ count: 0 });
    mocks.enqueue.mockResolvedValue(true);
  });

  it("sweeps stale PROCESSING rows and re-enqueues only the events whose retry is due", async () => {
    mocks.findMany.mockResolvedValue([{ id: "e1", connectionId: "conn-1" }]);
    await expect(recoverMercadoLibreWebhookEvents("conn-1")).resolves.toBe(1);
    expect(mocks.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PROCESSING", updatedAt: { lt: expect.any(Date) } }),
        data: expect.objectContaining({ status: "RETRY" }),
      }),
    );
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["PENDING", "RETRY"] },
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: expect.any(Date) } }],
        }),
        take: 50,
      }),
    );
    expect(mocks.enqueue).toHaveBeenCalledWith("e1", "conn-1");
  });
});
