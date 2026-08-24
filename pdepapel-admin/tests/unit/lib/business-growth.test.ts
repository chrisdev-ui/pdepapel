import { describe, expect, it } from "vitest";

import {
  DEFAULT_BUSINESS_CASH_POLICY,
  buildCampaignUtmPath,
  calculateBusinessCashPlan,
  recommendSocialCampaigns,
  validateBusinessCashPolicy,
} from "@/lib/business-growth";

describe("calculateBusinessCashPlan", () => {
  it("keeps inventory purchases and owner draws out of operating profit", () => {
    const plan = calculateBusinessCashPlan({
      operatingProfit: 1_000_000,
      policy: {
        ...DEFAULT_BUSINESS_CASH_POLICY,
        taxReserveRate: 10,
        reinvestmentRate: 50,
        ownerDrawRate: 40,
        minimumOperatingReserve: 50_000,
        marketingTestRate: 20,
      },
      movements: [
        { type: "OPERATING_EXPENSE", amount: 100_000 },
        { type: "MARKETING_SPEND", amount: 50_000 },
        { type: "INVENTORY_PURCHASE", amount: 200_000 },
        { type: "OWNER_DRAW", amount: 75_000 },
      ],
    });

    expect(plan.registeredExpenses).toBe(150_000);
    expect(plan.netAfterRegisteredExpenses).toBe(850_000);
    expect(plan.proposedTaxReserve).toBe(85_000);
    expect(plan.distributableAmount).toBe(715_000);
    expect(plan.inventoryPurchaseCommitments).toBe(200_000);
    expect(plan.recordedOwnerDraws).toBe(75_000);
    expect(plan.recommendedOwnerDraw).toBe(286_000);
    expect(plan.remainingOwnerDraw).toBe(211_000);
    expect(plan.suggestedMarketingTestBudget).toBe(71_500);
  });

  it("rejects a policy that distributes more than the available profit", () => {
    expect(() =>
      validateBusinessCashPolicy({
        ...DEFAULT_BUSINESS_CASH_POLICY,
        reinvestmentRate: 70,
        ownerDrawRate: 40,
      }),
    ).toThrow("no pueden superar el 100%");
  });
});

describe("recommendSocialCampaigns", () => {
  const candidate = {
    productId: "product-1",
    productName: "Cuaderno kawaii",
    slug: "cuaderno-kawaii",
    stock: 20,
    acquisitionCost: 8_000,
    imageCount: 3,
    descriptionLength: 140,
    totalQuantitySold: 12,
    totalProfit: 180_000,
    profitMarginPct: 48,
    riskState: "SAFE" as const,
    daysUntilStockout: 45,
    isDeadStock: false,
  };

  it("assigns a controlled budget only to products ready for a paid test", () => {
    const recommendations = recommendSocialCampaigns({
      candidates: [candidate],
      policy: DEFAULT_BUSINESS_CASH_POLICY,
      testBudget: 30_000,
    });

    expect(recommendations[0]).toMatchObject({
      state: "READY_TO_TEST",
      suggestedBudget: 30_000,
      objective: "SALES",
    });
    expect(recommendations[0]?.landingPath).toContain("utm_medium=paid_social");
  });

  it("holds products that can run out before the configured coverage", () => {
    const recommendations = recommendSocialCampaigns({
      candidates: [
        {
          ...candidate,
          stock: 3,
          riskState: "CRITICAL",
          daysUntilStockout: 2,
        },
      ],
      policy: DEFAULT_BUSINESS_CASH_POLICY,
      testBudget: 30_000,
    });

    expect(recommendations[0]).toMatchObject({
      state: "HOLD",
      suggestedBudget: 0,
    });
  });

  it("keeps existing query parameters when creating the campaign link", () => {
    expect(
      buildCampaignUtmPath({
        landingPath: "/producto/cuaderno-kawaii?color=rosa",
        channel: "INSTAGRAM",
        campaignName: "Vuelta a clases 2026",
      }),
    ).toBe(
      "/producto/cuaderno-kawaii?color=rosa&utm_source=instagram&utm_medium=paid_social&utm_campaign=vuelta-a-clases-2026",
    );
  });
});
