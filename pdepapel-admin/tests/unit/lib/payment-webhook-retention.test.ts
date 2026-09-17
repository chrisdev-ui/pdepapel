import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteMany: vi.fn() }));

vi.mock("@/lib/prismadb", () => ({
  default: { paymentWebhookEvent: { deleteMany: mocks.deleteMany } },
}));

import {
  PAYMENT_WEBHOOK_EVENT_RETENTION_DAYS,
  pruneSettledPaymentWebhookEvents,
} from "@/lib/payment-webhook-retention";

const NOW = new Date("2026-09-17T02:00:00.000Z");

describe("pruneSettledPaymentWebhookEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps settled events for 90 days by default", () => {
    expect(PAYMENT_WEBHOOK_EVENT_RETENTION_DAYS).toBe(90);
  });

  it("deletes only processed or ignored events completed before the cutoff", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 4 });

    const result = await pruneSettledPaymentWebhookEvents({ now: NOW });

    const cutoff = new Date("2026-06-19T02:00:00.000Z");
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        status: { in: ["PROCESSED", "IGNORED"] },
        completedAt: { lt: cutoff },
      },
    });
    expect(result).toEqual({ deleted: 4, olderThanDays: 90, cutoff });
  });

  it("honours a custom window", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    const result = await pruneSettledPaymentWebhookEvents({
      now: NOW,
      olderThanDays: 30,
    });

    expect(result.olderThanDays).toBe(30);
    expect(result.cutoff).toEqual(new Date("2026-08-18T02:00:00.000Z"));
  });
});
