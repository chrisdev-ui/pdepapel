import { describe, expect, it } from "vitest";

import {
  buildMercadoLibreCashflowSummary,
  parseMercadoLibreAccountBalance,
} from "@/lib/mercadolibre/cashflow";

describe("Mercado Libre cashflow", () => {
  it("separates released money from net sales still awaiting release", () => {
    const now = new Date("2026-08-11T12:00:00.000Z");
    const summary = buildMercadoLibreCashflowSummary(
      [
        {
          id: "upcoming-order",
          externalOrderId: "2000017813937484",
          paidAt: new Date("2026-08-08T12:00:00.000Z"),
          netAmount: 46_457,
          metadata: {
            financials: {
              moneyReleaseStatus: "pending",
              moneyReleaseDate: "2026-08-14T12:00:00.000Z",
            },
          },
        },
        {
          id: "released-order",
          externalOrderId: "2000017813937485",
          paidAt: now,
          netAmount: 18_000,
          metadata: {
            financials: { moneyReleaseStatus: "released" },
          },
        },
        {
          id: "pending-settlement",
          externalOrderId: "2000017813937486",
          paidAt: now,
          netAmount: null,
          metadata: null,
        },
        {
          id: "unknown-release",
          externalOrderId: "2000017813937487",
          paidAt: now,
          netAmount: 9_000,
          metadata: null,
        },
      ],
      {
        state: "AVAILABLE",
        availableBalance: 46_457,
        totalAmount: 55_457,
        unavailableBalance: 9_000,
      },
      now,
    );

    expect(summary.awaitingRelease).toEqual({ amount: 46_457, orders: 1 });
    expect(summary.settlementPending).toEqual({ orders: 1 });
    expect(summary.releaseStatusUnknown).toEqual({ orders: 1 });
    expect(summary.upcomingReleases).toEqual([
      expect.objectContaining({
        marketplaceOrderId: "upcoming-order",
        netAmount: 46_457,
      }),
    ]);
  });

  it("accepts only a valid Mercado Pago balance response", () => {
    expect(
      parseMercadoLibreAccountBalance({
        available_balance: 46_457.73,
        total_amount: 55_457.73,
        unavailable_balance: 9_000,
      }),
    ).toEqual({
      state: "AVAILABLE",
      availableBalance: 46_457.73,
      totalAmount: 55_457.73,
      unavailableBalance: 9_000,
    });

    expect(parseMercadoLibreAccountBalance({ total_amount: 46_457 })).toEqual({
      state: "UNAVAILABLE",
      reason: "INVALID_RESPONSE",
    });
  });
});
