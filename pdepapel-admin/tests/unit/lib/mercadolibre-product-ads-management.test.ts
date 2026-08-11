import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@/lib/mercadolibre/client", () => ({
  requestMercadoLibreJson: vi.fn(),
  mutateMercadoLibreJson: mocks.mutate,
}));

import { updateMercadoLibreProductAdsCampaign } from "@/lib/mercadolibre/product-ads";

describe("Mercado Libre Product Ads campaign management", () => {
  it("uses the current official campaign endpoint with an explicit status change", async () => {
    mocks.mutate.mockResolvedValue({ id: 987, status: "paused" });

    await updateMercadoLibreProductAdsCampaign({
      connectionId: "connection-1",
      siteId: "MCO",
      campaignId: "987",
      update: { status: "paused" },
    });

    expect(mocks.mutate).toHaveBeenCalledWith(
      "connection-1",
      "/marketplace/advertising/MCO/product_ads/campaigns/987",
      {
        method: "PUT",
        body: { status: "paused" },
        headers: { "api-version": "2" },
      },
    );
  });

  it("sends only the settings explicitly selected by the administrator", async () => {
    mocks.mutate.mockResolvedValue({ id: 987, budget: 30_000 });

    await updateMercadoLibreProductAdsCampaign({
      connectionId: "connection-1",
      siteId: "MCO",
      campaignId: "987",
      update: { budget: 30_000, roasTarget: 5, strategy: "profitability" },
    });

    expect(mocks.mutate).toHaveBeenCalledWith(
      "connection-1",
      "/marketplace/advertising/MCO/product_ads/campaigns/987",
      {
        method: "PUT",
        body: {
          budget: 30_000,
          roas_target: 5,
          strategy: "profitability",
        },
        headers: { "api-version": "2" },
      },
    );
  });
});
