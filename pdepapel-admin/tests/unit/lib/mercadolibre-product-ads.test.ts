import { describe, expect, it } from "vitest";

import {
  getMercadoLibreProductAdsOverview,
  getProductAdsDateRange,
} from "@/lib/mercadolibre/product-ads";

describe("Mercado Libre Product Ads", () => {
  it("uses a 30-day Colombia range and the current campaign endpoint", async () => {
    const calls: Array<{
      resource: string;
      headers?: Record<string, string>;
    }> = [];
    const responses = [
      {
        ok: true,
        status: 200,
        payload: {
          advertisers: [
            {
              advertiser_id: 12345,
              site_id: "MCO",
              advertiser_name: "P de Papel",
            },
          ],
        },
      },
      {
        ok: true,
        status: 200,
        payload: {
          paging: { total: 1 },
          results: [
            {
              id: 987,
              name: "Regreso a clases",
              status: "active",
              budget: 25_000,
              daily_budget: 5_000,
              currency_id: "COP",
              metrics: {
                clicks: 24,
                prints: 1200,
                cost: 8_000,
                total_amount: 40_000,
                units_quantity: 2,
                acos: 20,
                roas: 5,
              },
            },
          ],
          metrics_summary: {
            clicks: 24,
            prints: 1200,
            cost: 8_000,
            total_amount: 40_000,
            units_quantity: 2,
            acos: 20,
            roas: 5,
          },
        },
      },
    ];
    const requestJson = async (
      _connectionId: string,
      resource: string,
      _request?: typeof fetch,
      headers?: Record<string, string>,
    ) => {
      calls.push({ resource, headers });
      return responses.shift()!;
    };

    const overview = await getMercadoLibreProductAdsOverview({
      connectionId: "connection-1",
      siteId: "MCO",
      now: new Date("2026-08-10T12:00:00.000Z"),
      requestJson,
    });

    expect(overview).toMatchObject({
      state: "READY",
      advertiser: { id: "12345", name: "P de Papel" },
      range: { from: "2026-07-12", to: "2026-08-10" },
      currencyId: "COP",
      totalCampaigns: 1,
      summary: {
        cost: 8_000,
        totalAmount: 40_000,
        acos: 20,
        roas: 5,
      },
      campaigns: [
        {
          id: "987",
          status: "active",
          metrics: { clicks: 24, cost: 8_000, roas: 5 },
        },
      ],
    });
    expect(calls).toEqual([
      {
        resource: "/advertising/advertisers?product_id=PADS",
        headers: {
          "Content-Type": "application/json",
          "api-version": "1",
        },
      },
      {
        resource:
          "/advertising/MCO/advertisers/12345/product_ads/campaigns/search?limit=50&offset=0&date_from=2026-07-12&date_to=2026-08-10&metrics=clicks%2Cprints%2Cctr%2Ccost%2Ccpc%2Cacos%2Croas%2Ccvr%2Ctotal_amount%2Cunits_quantity&metrics_summary=true",
        headers: { "api-version": "2" },
      },
    ]);
  });

  it("keeps Product Ads unavailable without treating it as a broken sale connection", async () => {
    const overview = await getMercadoLibreProductAdsOverview({
      connectionId: "connection-1",
      siteId: "MCO",
      requestJson: async () => ({
        ok: false,
        status: 404,
        payload: {
          description: "No permissions found for user_id 1",
        },
      }),
    });

    expect(overview).toEqual({
      state: "NOT_ENABLED",
      message:
        "Product Ads aún no está disponible para esta conexión. Activa Publicidad en Mercado Libre, concede el permiso de publicidad y reconecta la cuenta.",
    });
  });

  it("keeps date calculations anchored to Colombia", () => {
    expect(
      getProductAdsDateRange(new Date("2026-08-10T03:30:00.000Z")),
    ).toEqual({
      from: "2026-07-11",
      to: "2026-08-09",
    });
  });
});
