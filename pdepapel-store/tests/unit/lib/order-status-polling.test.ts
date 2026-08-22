import { describe, expect, it } from "vitest";

import { OrderStatus } from "@/constants";
import {
  ORDER_STATUS_POLL_INTERVAL_MS,
  shouldPollOrderStatus,
} from "@/lib/order-status-polling";

describe("order status polling", () => {
  it("limits pending-payment refreshes to a visible tab", () => {
    expect(ORDER_STATUS_POLL_INTERVAL_MS).toBe(10_000);
    expect(shouldPollOrderStatus(OrderStatus.CREATED, true)).toBe(true);
    expect(shouldPollOrderStatus(OrderStatus.PENDING, true)).toBe(true);
    expect(shouldPollOrderStatus(OrderStatus.PENDING, false)).toBe(false);
  });

  it("stops refreshing after the payment reaches a final state", () => {
    expect(shouldPollOrderStatus(OrderStatus.PAID, true)).toBe(false);
    expect(shouldPollOrderStatus(OrderStatus.CANCELLED, true)).toBe(false);
  });
});
