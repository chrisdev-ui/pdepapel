import { describe, expect, it } from "vitest";

import {
  buildMercadoLibreCashflowSummary,
  mergeMercadoLibreReleaseStatus,
  needsMercadoLibreReleaseStatusRefresh,
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
          totalAmount: 69_000,
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
          totalAmount: 18_000,
          netAmount: 18_000,
          metadata: {
            financials: { moneyReleaseStatus: "released" },
          },
        },
        {
          id: "pending-settlement",
          externalOrderId: "2000017813937486",
          paidAt: now,
          totalAmount: 18_000,
          netAmount: null,
          metadata: null,
        },
        {
          id: "unknown-release",
          externalOrderId: "2000017813937487",
          paidAt: now,
          totalAmount: 9_000,
          netAmount: 9_000,
          metadata: null,
        },
      ],
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

  it("updates release details without replacing historical reconciliation data", () => {
    const checkedAt = new Date("2026-08-11T12:00:00.000Z");
    const metadata = mergeMercadoLibreReleaseStatus({
      metadata: {
        source: "HISTORICAL_RECONCILIATION",
        taxesAmount: 933,
        reconciledFromPackId: "2000014415856007",
      },
      moneyReleaseDate: "2026-08-14T12:00:00.000Z",
      moneyReleaseStatus: "pending",
      checkedAt,
    });

    expect(metadata).toMatchObject({
      source: "HISTORICAL_RECONCILIATION",
      taxesAmount: 933,
      reconciledFromPackId: "2000014415856007",
      financials: {
        moneyReleaseDate: "2026-08-14T12:00:00.000Z",
        moneyReleaseStatus: "pending",
        releaseStatusCheckedAt: checkedAt.toISOString(),
      },
    });
    expect(needsMercadoLibreReleaseStatusRefresh(metadata, checkedAt)).toBe(
      false,
    );
  });
});
