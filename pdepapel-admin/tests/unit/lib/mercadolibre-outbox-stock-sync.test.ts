import {
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOutboxEvent: vi.fn(),
  claimOutboxEvent: vi.fn(),
  completeOutboxEvent: vi.fn(),
  updateOutboxEvent: vi.fn(),
  findOutboxEvents: vi.fn(),
  sweepOutboxEvents: vi.fn(),
  findMarketplaceOrders: vi.fn(),
  liveProduct: vi.fn(),
  txProduct: vi.fn(),
  updateListing: vi.fn(),
  updateConnection: vi.fn(),
  accessToken: vi.fn(),
  enqueue: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceOutboxEvent: {
      findUnique: mocks.findOutboxEvent,
      findMany: mocks.findOutboxEvents,
      // Fuera de la transacción: el claim y la barrida de PROCESSING colgados.
      updateMany: (args: { data?: { status?: string } }) =>
        args.data?.status === MarketplaceOutboxStatus.RETRY
          ? mocks.sweepOutboxEvents(args)
          : mocks.claimOutboxEvent(args),
      update: mocks.updateOutboxEvent,
    },
    marketplaceOrder: { findMany: mocks.findMarketplaceOrders },
    product: { findUnique: mocks.liveProduct },
    $transaction: async (
      callback: (transaction: unknown) => Promise<unknown>,
    ) =>
      callback({
        marketplaceOutboxEvent: {
          update: mocks.updateOutboxEvent,
          updateMany: mocks.completeOutboxEvent,
        },
        marketplaceListing: { update: mocks.updateListing },
        marketplaceConnection: { update: mocks.updateConnection },
        product: { findUnique: mocks.txProduct },
      }),
  },
}));
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreAccessToken: mocks.accessToken,
}));
vi.mock("@/lib/mercadolibre/queue", () => ({
  enqueueMercadoLibreOutboxEvent: mocks.enqueue,
}));

import {
  MAX_OUTBOX_EVENT_ATTEMPTS,
  enqueuePendingMarketplaceOutboxEvents,
  processMarketplaceOutboxEvent,
} from "@/lib/mercadolibre/outbox";

const listing = {
  id: "listing-id",
  connectionId: "connection-id",
  externalItemId: "MCO123",
  externalVariationId: null,
  categoryId: null,
  listingType: null,
  marketplacePrice: 10000,
  stockSafetyBuffer: 1,
  metadata: null,
  product: { id: "product-id", name: "Cuaderno", stock: 5, images: [] },
};

function stockEvent(targetQuantity: number, overrides: Record<string, unknown> = {}) {
  return {
    id: "stock-event-id",
    connectionId: "connection-id",
    action: MarketplaceOutboxAction.SYNC_STOCK,
    payload: { targetQuantity },
    status: MarketplaceOutboxStatus.PENDING,
    attempts: 0,
    availableAt: new Date(Date.now() - 1000),
    listing,
    ...overrides,
  };
}

function sentQuantity() {
  const [, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
  return (JSON.parse(String(init.body)) as { available_quantity: number })
    .available_quantity;
}

describe("Mercado Libre stock sync race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    mocks.accessToken.mockResolvedValue("token");
    mocks.claimOutboxEvent.mockResolvedValue({ count: 1 });
    mocks.completeOutboxEvent.mockResolvedValue({ count: 1 });
    mocks.updateOutboxEvent.mockResolvedValue({});
    mocks.updateListing.mockResolvedValue({});
    mocks.updateConnection.mockResolvedValue({});
    mocks.enqueue.mockResolvedValue(true);
    mocks.findOutboxEvent.mockResolvedValue(stockEvent(4));
  });

  it("pushes the live stock at processing time, not the quantity stored when the event was queued", async () => {
    // El evento se encoló con stock 5 (target 4); mientras esperaba, otra venta dejó 3.
    mocks.liveProduct.mockResolvedValue({ stock: 3 });
    mocks.txProduct.mockResolvedValue({ stock: 3 });

    await expect(processMarketplaceOutboxEvent("stock-event-id")).resolves.toEqual({
      processed: true,
      reason: "processed",
    });
    expect(sentQuantity()).toBe(2);
    expect(mocks.completeOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stock-event-id", status: MarketplaceOutboxStatus.PROCESSING },
        data: expect.objectContaining({ status: MarketplaceOutboxStatus.COMPLETED }),
      }),
    );
    expect(mocks.updateListing).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastSyncedStock: 2 }) }),
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("does not mark the event COMPLETED when a newer upsert reset it to PENDING mid-flight, and re-enqueues it", async () => {
    mocks.liveProduct.mockResolvedValue({ stock: 5 });
    mocks.txProduct.mockResolvedValue({ stock: 5 });
    // El upsert concurrente devolvió la fila a PENDING: el cierre guardado no encuentra PROCESSING.
    mocks.completeOutboxEvent
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(processMarketplaceOutboxEvent("stock-event-id")).resolves.toEqual({
      processed: true,
      reason: "superseded",
    });
    expect(sentQuantity()).toBe(4);
    expect(mocks.updateOutboxEvent).not.toHaveBeenCalled();
    expect(mocks.enqueue).toHaveBeenCalledWith("stock-event-id", "connection-id", "operation");
  });

  it("leaves the event open when the local stock moved between the read and the completion", async () => {
    mocks.liveProduct.mockResolvedValue({ stock: 5 });
    mocks.txProduct.mockResolvedValue({ stock: 2 });
    mocks.completeOutboxEvent.mockResolvedValue({ count: 1 });

    await expect(processMarketplaceOutboxEvent("stock-event-id")).resolves.toEqual({
      processed: true,
      reason: "superseded",
    });
    // Lo enviado (4) ya es viejo: no se cierra con COMPLETED, se devuelve a PENDING.
    expect(mocks.completeOutboxEvent).toHaveBeenCalledTimes(1);
    expect(mocks.completeOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stock-event-id", status: MarketplaceOutboxStatus.PROCESSING },
        data: expect.objectContaining({ status: MarketplaceOutboxStatus.PENDING }),
      }),
    );
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });

  it("answers an early redelivery with not_due and leaves the event untouched", async () => {
    mocks.findOutboxEvent.mockResolvedValue(
      stockEvent(4, { status: "RETRY", availableAt: new Date(Date.now() + 60_000) }),
    );
    await expect(processMarketplaceOutboxEvent("stock-event-id")).resolves.toEqual({
      processed: false,
      reason: "not_due",
    });
    expect(mocks.claimOutboxEvent).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("schedules a retry on a remote error and gives up with FAILED after the last attempt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.liveProduct.mockResolvedValue({ stock: 5 });
    mocks.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => "" });

    mocks.findOutboxEvent.mockResolvedValueOnce(stockEvent(4, { attempts: 1 }));
    await expect(processMarketplaceOutboxEvent("stock-event-id")).resolves.toEqual({
      processed: false,
      reason: "retry_scheduled",
    });
    expect(mocks.updateOutboxEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceOutboxStatus.RETRY }) }),
    );

    mocks.findOutboxEvent.mockResolvedValueOnce(
      stockEvent(4, { status: "RETRY", attempts: MAX_OUTBOX_EVENT_ATTEMPTS - 1 }),
    );
    await expect(processMarketplaceOutboxEvent("stock-event-id")).resolves.toEqual({
      processed: false,
      reason: "failed",
    });
    expect(mocks.updateOutboxEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MarketplaceOutboxStatus.FAILED,
          lastError: expect.stringContaining("Se agotaron los 12 intentos"),
        }),
      }),
    );
  });

  it("sweeps events stuck in PROCESSING back to RETRY before re-dispatching", async () => {
    mocks.findMarketplaceOrders.mockResolvedValue([]);
    mocks.sweepOutboxEvents.mockResolvedValue({ count: 1 });
    mocks.findOutboxEvents.mockResolvedValue([]);

    await expect(enqueuePendingMarketplaceOutboxEvents("connection-id")).resolves.toBe(0);
    expect(mocks.sweepOutboxEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          connectionId: "connection-id",
          status: MarketplaceOutboxStatus.PROCESSING,
          updatedAt: { lt: expect.any(Date) },
        }),
        data: expect.objectContaining({ status: MarketplaceOutboxStatus.RETRY }),
      }),
    );
  });
});
