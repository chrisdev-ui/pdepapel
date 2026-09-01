import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  calculateCashPlan: vi.fn(),
  findCampaigns: vi.fn(),
  findMovements: vi.fn(),
  findPolicy: vi.fn(),
  findProducts: vi.fn(),
  getDeadInventory: vi.fn(),
  getInventoryRisk: vi.fn(),
  getMonthlyFinancialSummary: vi.fn(),
  getProductProfitRanking: vi.fn(),
  getSeason: vi.fn(),
  productCount: vi.fn(),
  recommendCampaigns: vi.fn(),
}));

vi.mock("@/actions/get-financial-analytics", () => ({
  getMonthlyFinancialSummary: mocks.getMonthlyFinancialSummary,
}));
vi.mock("@/actions/get-inventory-risk", () => ({
  getInventoryRisk: mocks.getInventoryRisk,
}));
vi.mock("@/actions/get-product-profitability", () => ({
  getDeadInventory: mocks.getDeadInventory,
  getProductProfitRanking: mocks.getProductProfitRanking,
}));
vi.mock("@/lib/business-growth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/business-growth")>();
  return {
    ...actual,
    calculateBusinessCashPlan: mocks.calculateCashPlan,
    getCommercialSeason: mocks.getSeason,
    recommendSocialCampaigns: mocks.recommendCampaigns,
  };
});
vi.mock("@/lib/date-utils", () => ({
  getColombiaDate: () => new Date(2026, 8, 1, 12),
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    businessCashPolicy: { findUnique: mocks.findPolicy },
    businessCashMovement: { findMany: mocks.findMovements },
    growthCampaign: { findMany: mocks.findCampaigns },
    product: {
      count: mocks.productCount,
      findMany: mocks.findProducts,
    },
  },
}));

import { getBusinessGrowthOverview } from "@/lib/business-growth-data";

describe("business growth historical overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMonthlyFinancialSummary.mockImplementation(
      async (_storeId: string, _year: number, month: number) => ({
        total_revenue: month * 1_000,
        total_net_profit: month * 100,
        average_margin: 25,
        total_orders: month,
      }),
    );
    mocks.calculateCashPlan.mockImplementation(
      ({ operatingProfit }: { operatingProfit: number }) => ({
        operatingProfit,
        registeredExpenses: 0,
        proposedTaxReserve: 0,
        recommendedReinvestment: 0,
        suggestedMarketingTestBudget: operatingProfit,
        recordedOwnerDraws: 0,
        inventoryPurchaseCommitments: 0,
        remainingOwnerDraw: 0,
        unallocatedSafetyAmount: 0,
      }),
    );
    mocks.findPolicy.mockResolvedValue(null);
    mocks.findMovements.mockResolvedValue([]);
    mocks.getProductProfitRanking.mockResolvedValue([]);
    mocks.getInventoryRisk.mockResolvedValue([]);
    mocks.getDeadInventory.mockResolvedValue([]);
    mocks.findCampaigns.mockResolvedValue([]);
    mocks.productCount.mockResolvedValue(0);
    mocks.findProducts.mockResolvedValue([]);
    mocks.recommendCampaigns.mockReturnValue([]);
    mocks.getSeason.mockReturnValue("Temporada actual");
  });

  it("keeps current campaign budgets independent from a historical cash view", async () => {
    const overview = await getBusinessGrowthOverview(
      "store-id",
      new Date(2026, 7, 15),
    );

    expect(overview.period).toMatchObject({
      year: 2026,
      month: 8,
      isCurrent: false,
    });
    expect(overview.cashPlan.operatingProfit).toBe(800);
    expect(mocks.getMonthlyFinancialSummary).toHaveBeenCalledWith(
      "store-id",
      2026,
      9,
    );
    expect(mocks.recommendCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ testBudget: 900 }),
    );
    expect(mocks.getSeason).toHaveBeenCalledWith(
      expect.objectContaining({}),
    );
  });
});
