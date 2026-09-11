import {
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findOutboxEvent: vi.fn(),
  claimOutboxEvent: vi.fn(),
  completeOutboxEvent: vi.fn(),
  findMarketplaceOrder: vi.fn(),
  updateOutboxEvent: vi.fn(),
  updateConnection: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceOutboxEvent: {
      findUnique: mocks.findOutboxEvent,
      updateMany: mocks.claimOutboxEvent,
      update: mocks.updateOutboxEvent,
    },
    marketplaceOrder: {
      findUnique: mocks.findMarketplaceOrder,
    },
    $transaction: async (
      callback: (transaction: {
        marketplaceOutboxEvent: {
          update: typeof mocks.updateOutboxEvent;
          updateMany: typeof mocks.completeOutboxEvent;
        };
        marketplaceConnection: { update: typeof mocks.updateConnection };
      }) => Promise<unknown>,
    ) =>
      callback({
        marketplaceOutboxEvent: {
          update: mocks.updateOutboxEvent,
          updateMany: mocks.completeOutboxEvent,
        },
        marketplaceConnection: { update: mocks.updateConnection },
      }),
  },
}));

vi.mock("@/lib/mercadolibre/order-notification", () => ({
  sendMercadoLibreOrderNotification: mocks.sendNotification,
}));

import { processMarketplaceOutboxEvent } from "@/lib/mercadolibre/outbox";

describe("Mercado Libre outbox sale notification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimOutboxEvent.mockResolvedValue({ count: 1 });
    mocks.completeOutboxEvent.mockResolvedValue({ count: 1 });
    mocks.sendNotification.mockResolvedValue(undefined);
    mocks.updateOutboxEvent.mockResolvedValue({});
    mocks.updateConnection.mockResolvedValue({});
    mocks.findOutboxEvent.mockResolvedValue({
      id: "notification-event-id",
      connectionId: "connection-id",
      action: MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION,
      payload: { marketplaceOrderId: "marketplace-order-id" },
      status: MarketplaceOutboxStatus.PENDING,
      attempts: 0,
      availableAt: new Date(Date.now() - 1000),
      listing: null,
    });
    mocks.findMarketplaceOrder.mockResolvedValue({
      id: "marketplace-order-id",
      connectionId: "connection-id",
      externalOrderId: "2000017890359944",
      buyerName: "Ana Pérez",
      paidAt: new Date("2026-08-12T03:29:24.000Z"),
      netAmount: null,
      inventoryStatus: "DECREMENTED",
      connection: { storeId: "store-id" },
      items: [
        {
          title: "Termo Owala",
          quantity: 1,
          product: { name: "Termo Owala", sku: "TERMO-OWALA-01" },
        },
      ],
    });
  });

  it("sends the paid-sale alert without waiting for the financial settlement", async () => {
    await expect(
      processMarketplaceOutboxEvent("notification-event-id"),
    ).resolves.toEqual({ processed: true, reason: "processed" });

    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: "2000017890359944",
        netAmount: null,
      }),
    );
    // El cierre exige que el evento siga en PROCESSING: si otro upsert lo
    // devolvió a PENDING mientras corría, no se pisa con COMPLETED.
    expect(mocks.completeOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "notification-event-id",
          status: MarketplaceOutboxStatus.PROCESSING,
        },
        data: expect.objectContaining({
          status: MarketplaceOutboxStatus.COMPLETED,
        }),
      }),
    );
  });
});
