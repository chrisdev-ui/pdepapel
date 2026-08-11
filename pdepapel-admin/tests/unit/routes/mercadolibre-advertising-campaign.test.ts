import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findConnection: vi.fn(),
  createAction: vi.fn(),
  updateAction: vi.fn(),
  verifyStoreOwner: vi.fn(),
  getOverview: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findUnique: mocks.findConnection },
    marketplaceCampaignAction: {
      create: mocks.createAction,
      update: mocks.updateAction,
    },
  },
}));
vi.mock("@/lib/mercadolibre/product-ads", () => ({
  PRODUCT_ADS_STRATEGIES: ["profitability", "increase", "visibility"],
  getMercadoLibreProductAdsOverview: mocks.getOverview,
  updateMercadoLibreProductAdsCampaign: mocks.updateCampaign,
}));

import { PUT } from "@/app/api/[storeId]/marketplaces/mercadolibre/advertising/campaigns/[campaignId]/route";

describe("Mercado Libre Product Ads campaign route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("pauses only a current campaign and records the explicit action", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findConnection.mockResolvedValue({
      id: "connection-id",
      siteId: "MCO",
      status: "CONNECTED",
    });
    mocks.getOverview.mockResolvedValue({
      state: "READY",
      campaigns: [
        {
          id: "987",
          status: "active",
          budget: 30_000,
          dailyBudget: null,
          roasTarget: 5,
          strategy: "profitability",
          lastUpdated: "2026-08-10T12:00:00.000Z",
        },
      ],
    });
    mocks.createAction.mockResolvedValue({ id: "action-id" });
    mocks.updateCampaign.mockResolvedValue({ id: 987, status: "paused" });

    const response = await PUT(
      new Request("https://admin.example.com", {
        method: "PUT",
        body: JSON.stringify({ action: "PAUSE" }),
      }),
      { params: { storeId: "store-id", campaignId: "987" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.updateCampaign).toHaveBeenCalledWith({
      connectionId: "connection-id",
      siteId: "MCO",
      campaignId: "987",
      update: { status: "paused" },
    });
    expect(mocks.createAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalCampaignId: "987",
          action: "PAUSE",
          requestedBy: "owner-id",
          requested: { status: "paused" },
        }),
      }),
    );
    expect(mocks.updateAction).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SUCCEEDED" }),
      }),
    );
  });

  it("rejects a ROAS target outside Mercado Libre's documented limits", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findConnection.mockResolvedValue({
      id: "connection-id",
      siteId: "MCO",
      status: "CONNECTED",
    });
    mocks.getOverview.mockResolvedValue({
      state: "READY",
      campaigns: [{ id: "987", status: "active" }],
    });

    const response = await PUT(
      new Request("https://admin.example.com", {
        method: "PUT",
        body: JSON.stringify({ action: "UPDATE_SETTINGS", roasTarget: 36 }),
      }),
      { params: { storeId: "store-id", campaignId: "987" } },
    );

    expect(response.status).toBe(400);
    expect(mocks.updateCampaign).not.toHaveBeenCalled();
  });
});
