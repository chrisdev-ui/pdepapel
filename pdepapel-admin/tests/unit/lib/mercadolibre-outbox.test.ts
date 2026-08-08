import { MarketplaceOutboxAction } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  queueMarketplaceOrderFinancials,
  queueMarketplaceOrderNotification,
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
});
