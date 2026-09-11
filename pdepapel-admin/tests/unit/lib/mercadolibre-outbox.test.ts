import { MarketplaceOutboxAction } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  queueMarketplaceListingPublicationEvent,
  queueMarketplaceListingContentSyncEvent,
  queueMarketplaceListingStatusSyncEvent,
  queueMarketplaceOrderFinancials,
  queueMarketplaceOrderNotification,
  queueMarketplacePriceSyncEvent,
} from "@/lib/mercadolibre/outbox";

describe("Mercado Libre outbox", () => {
  it("creates a durable, idempotent notification event for a paid sale", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplaceOrderNotification(
      { marketplaceOutboxEvent: { upsert } } as never,
      {
        connectionId: "connection-id",
        externalOrderId: "2000017813937484",
        marketplaceOrderId: "marketplace-order-id",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: "connection-id:order-notification:2000017813937484",
        },
        create: expect.objectContaining({
          action: MarketplaceOutboxAction.SEND_ORDER_NOTIFICATION,
          payload: { marketplaceOrderId: "marketplace-order-id" },
        }),
      }),
    );
  });

  it("creates a durable financial reconciliation event before recording net income", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplaceOrderFinancials(
      { marketplaceOutboxEvent: { upsert } } as never,
      {
        connectionId: "connection-id",
        externalOrderId: "2000017813937484",
        marketplaceOrderId: "marketplace-order-id",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: "connection-id:order-financials:2000017813937484",
        },
        create: expect.objectContaining({
          action: MarketplaceOutboxAction.SYNC_ORDER_FINANCIALS,
          payload: { marketplaceOrderId: "marketplace-order-id" },
        }),
      }),
    );
  });

  it("re-opens the financial reconciliation when a refund changes an already written net", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplaceOrderFinancials(
      { marketplaceOutboxEvent: { upsert } } as never,
      {
        connectionId: "connection-id",
        externalOrderId: "2000017813937484",
        marketplaceOrderId: "marketplace-order-id",
        reset: true,
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "PENDING", lastError: null }),
      }),
    );
  });

  it("creates an idempotent price synchronization event", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplacePriceSyncEvent(
      { marketplaceOutboxEvent: { upsert } } as never,
      {
        connectionId: "connection-id",
        listingId: "listing-id",
        productId: "product-id",
        targetPrice: 79000,
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deduplicationKey: "connection-id:price:listing-id" },
        create: expect.objectContaining({
          action: MarketplaceOutboxAction.SYNC_PRICE,
          payload: { targetPrice: 79000 },
        }),
      }),
    );
  });

  it("creates an idempotent listing content synchronization event", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplaceListingContentSyncEvent(
      { marketplaceOutboxEvent: { upsert } } as never,
      {
        connectionId: "connection-id",
        listingId: "listing-id",
        productId: "product-id",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deduplicationKey: "connection-id:content:listing-id" },
        create: expect.objectContaining({
          action: MarketplaceOutboxAction.SYNC_LISTING_CONTENT,
          payload: {},
        }),
      }),
    );
  });

  it("queues a publication once and keeps it safe for retry", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplaceListingPublicationEvent(
      { marketplaceOutboxEvent: { updateMany, findUnique, create } } as never,
      {
        connectionId: "connection-id",
        listingId: "listing-id",
        productId: "product-id",
      },
    );

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deduplicationKey: "connection-id:publish:listing-id",
          status: { not: "PROCESSING" },
        },
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: MarketplaceOutboxAction.PUBLISH_LISTING,
          deduplicationKey: "connection-id:publish:listing-id",
          payload: {},
        }),
      }),
    );
  });

  it("never reopens a publication event that is being processed right now", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const findUnique = vi.fn().mockResolvedValue({ id: "event-id" });
    const create = vi.fn();

    await queueMarketplaceListingPublicationEvent(
      { marketplaceOutboxEvent: { updateMany, findUnique, create } } as never,
      { connectionId: "connection-id", listingId: "listing-id", productId: "product-id" },
    );

    expect(create).not.toHaveBeenCalled();
  });

  it("queues an explicit pause or activation instead of changing remote status inline", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "event-id" });

    await queueMarketplaceListingStatusSyncEvent(
      { marketplaceOutboxEvent: { upsert } } as never,
      {
        connectionId: "connection-id",
        listingId: "listing-id",
        productId: "product-id",
        targetStatus: "paused",
      },
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deduplicationKey: "connection-id:status:listing-id" },
        create: expect.objectContaining({
          action: MarketplaceOutboxAction.SYNC_LISTING_STATUS,
          payload: { targetStatus: "paused" },
        }),
      }),
    );
  });
});
