import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findListing: vi.fn(),
  updateListing: vi.fn(),
  findConnection: vi.fn(),
  getJson: vi.fn(),
  requestJson: vi.fn(),
  mutateJson: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: {
      findFirst: mocks.findListing,
      update: mocks.updateListing,
    },
    marketplaceConnection: { findUnique: mocks.findConnection },
  },
}));
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreJson: mocks.getJson,
  requestMercadoLibreJson: mocks.requestJson,
  mutateMercadoLibreJson: mocks.mutateJson,
}));

import {
  GET as getSaleConditions,
  PATCH as updateSaleConditions,
} from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/sale-conditions/route";
import { GET as getShippingCost } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/shipping-cost/route";

const listing = {
  id: "listing-id",
  connectionId: "connection-id",
  externalItemId: "MCO123",
  metadata: null,
  connection: { siteId: "MCO" },
};

function remoteItem({
  listingType = "gold_special",
  freeShipping = false,
  mandatoryFreeShipping = false,
} = {}) {
  return {
    id: "MCO123",
    category_id: "MCO456",
    listing_type_id: listingType,
    price: 80_000,
    shipping: {
      mode: "me2",
      logistic_type: "drop_off",
      free_shipping: freeShipping,
      local_pick_up: false,
      tags: mandatoryFreeShipping ? ["mandatory_free_shipping"] : [],
    },
  };
}

const priceOptions = [
  {
    listing_type_id: "gold_special",
    listing_type_name: "Clásica",
    listing_exposure: "highest",
    sale_fee_amount: 13_110,
    sale_fee_details: {
      percentage_fee: 16,
      fixed_fee: 0,
      financing_add_on_fee: 0,
    },
  },
  {
    listing_type_id: "gold_pro",
    listing_type_name: "Premium",
    listing_exposure: "highest",
    sale_fee_amount: 17_478,
    sale_fee_details: {
      percentage_fee: 16,
      fixed_fee: 0,
      financing_add_on_fee: 4_368,
    },
  },
];

describe("Mercado Libre sale conditions routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findListing.mockResolvedValue(listing);
    mocks.updateListing.mockResolvedValue(listing);
  });

  it("returns only the allowed installment plans with their real fees", async () => {
    mocks.getJson.mockImplementation(
      async (_connectionId: string, resource: string) =>
        resource.includes("listing_prices") ? priceOptions : remoteItem(),
    );
    mocks.requestJson.mockResolvedValue({
      ok: true,
      payload: [{ id: "gold_pro" }],
    });

    const response = await getSaleConditions(
      new Request("https://admin.example.com"),
      { params: { storeId: "store-id", listingId: "listing-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      current: {
        listingType: "gold_special",
        freeShipping: false,
      },
      availableListingTypes: ["gold_special", "gold_pro"],
      options: [
        { installmentCount: 3, saleFeeAmount: 13_110 },
        { installmentCount: 6, saleFeeAmount: 17_478 },
      ],
    });
    expect(mocks.updateListing).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listingType: "gold_special" }),
      }),
    );
  });

  it("blocks disabling free shipping when Mercado Libre requires it", async () => {
    mocks.getJson.mockResolvedValue(
      remoteItem({ freeShipping: true, mandatoryFreeShipping: true }),
    );
    mocks.requestJson.mockResolvedValue({ ok: true, payload: [] });

    const response = await updateSaleConditions(
      new Request("https://admin.example.com", {
        method: "PATCH",
        body: JSON.stringify({
          listingType: "gold_special",
          freeShipping: false,
        }),
      }),
      { params: { storeId: "store-id", listingId: "listing-id" } },
    );

    expect(response.status).toBe(400);
    expect(mocks.mutateJson).not.toHaveBeenCalled();
  });

  it("updates installments and shipping and persists the final remote state", async () => {
    mocks.getJson
      .mockResolvedValueOnce(remoteItem())
      .mockResolvedValueOnce(remoteItem({ listingType: "gold_pro" }))
      .mockResolvedValueOnce(
        remoteItem({ listingType: "gold_pro", freeShipping: true }),
      );
    mocks.requestJson.mockResolvedValue({
      ok: true,
      payload: [{ id: "gold_pro" }],
    });
    mocks.mutateJson.mockResolvedValue({});

    const response = await updateSaleConditions(
      new Request("https://admin.example.com", {
        method: "PATCH",
        body: JSON.stringify({
          listingType: "gold_pro",
          freeShipping: true,
        }),
      }),
      { params: { storeId: "store-id", listingId: "listing-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.mutateJson).toHaveBeenNthCalledWith(
      1,
      "connection-id",
      "/items/MCO123/listing_type",
      { method: "POST", body: { id: "gold_pro" } },
    );
    expect(mocks.mutateJson).toHaveBeenNthCalledWith(
      2,
      "connection-id",
      "/items/MCO123",
      { method: "PUT", body: { shipping: { free_shipping: true } } },
    );
    expect(mocks.updateListing).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ listingType: "gold_pro" }),
      }),
    );
  });

  it("quotes the seller shipping cost for an active listing", async () => {
    mocks.findListing.mockResolvedValue({
      externalItemId: "MCO123",
      connection: { id: "connection-id", sellerId: "seller-id" },
    });
    mocks.getJson.mockResolvedValue(remoteItem());
    mocks.requestJson
      .mockResolvedValueOnce({
        ok: true,
        payload: {
          coverage: {
            all_country: {
              list_cost: 0,
              currency_id: "COP",
              billable_weight: 500,
            },
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        payload: {
          coverage: {
            all_country: {
              list_cost: 15_200,
              currency_id: "COP",
              billable_weight: 500,
              discount: { rate: 0.5, promoted_amount: 30_400 },
            },
          },
        },
      });

    const response = await getShippingCost(
      new Request(
        "https://admin.example.com/api/store-id/marketplaces/mercadolibre/listings/shipping-cost?listingId=listing-id&price=80000&listingType=gold_special",
      ),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      buyerPays: { sellerCost: 0 },
      sellerOffersFree: {
        sellerCost: 15_200,
        promotedAmount: 30_400,
      },
      mandatoryFreeShipping: false,
      logisticType: "drop_off",
    });
  });
});
