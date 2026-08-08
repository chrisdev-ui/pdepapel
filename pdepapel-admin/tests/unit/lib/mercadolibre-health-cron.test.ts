import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findConnections: vi.fn(),
  getHealthSummary: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: {
      findMany: mocks.findConnections,
    },
  },
}));

vi.mock("@/lib/mercadolibre/health", () => ({
  getMercadoLibreHealthSummary: mocks.getHealthSummary,
}));

vi.mock("@/lib/mercadolibre/health-notification", () => ({
  sendMercadoLibreHealthNotification: mocks.sendNotification,
}));

import { processMercadoLibreHealthChecks } from "@/lib/mercadolibre/health-cron";

const healthSummary = {
  totalListings: 0,
  activeListings: 0,
  unansweredQuestions: 0,
  shipmentsToDispatch: 0,
  claimsRequiringAttention: 0,
  grossSales: 0,
  netSales: 0,
  marketplaceCosts: 0,
  netProfit: 0,
  issues: [],
};

describe("Mercado Libre health cron", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues processing healthy stores when one connection fails", async () => {
    mocks.findConnections.mockResolvedValue([
      { id: "connection-1", storeId: "store-1" },
      { id: "connection-2", storeId: "store-2" },
    ]);
    mocks.getHealthSummary.mockImplementation(async (connectionId: string) => {
      if (connectionId === "connection-2") {
        throw new Error("Mercado Libre is unavailable");
      }

      return healthSummary;
    });
    mocks.sendNotification.mockResolvedValue(undefined);

    await expect(processMercadoLibreHealthChecks()).resolves.toEqual({
      processed: [{ connectionId: "connection-1", issues: 0 }],
      failed: 1,
    });
    expect(mocks.sendNotification).toHaveBeenCalledWith({
      storeId: "store-1",
      summary: healthSummary,
    });
    expect(mocks.getHealthSummary).toHaveBeenCalledWith("connection-1", {
      includeFinancials: false,
    });
  });

  it("does nothing when Mercado Libre is not connected", async () => {
    mocks.findConnections.mockResolvedValue([]);

    await expect(processMercadoLibreHealthChecks()).resolves.toEqual({
      processed: [],
      failed: 0,
    });
    expect(mocks.getHealthSummary).not.toHaveBeenCalled();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
