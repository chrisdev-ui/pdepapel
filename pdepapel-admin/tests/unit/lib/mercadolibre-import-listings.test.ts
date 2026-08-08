import { MarketplaceListingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { parseMercadoLibreListing } from "@/lib/mercadolibre/import-listings";

describe("Mercado Libre listing import", () => {
  it("keeps a publication without SKU available for manual linking", () => {
    expect(
      parseMercadoLibreListing({
        id: "MCO2000000001",
        title: "Publicación sin SKU",
        status: "active",
        price: 69_000,
        available_quantity: 3,
      }),
    ).toEqual([
      expect.objectContaining({
        externalItemId: "MCO2000000001",
        externalVariationId: null,
        sellerSku: null,
        status: MarketplaceListingStatus.ACTIVE,
      }),
    ]);
  });

  it("uses each variation SKU when a publication has variants", () => {
    expect(
      parseMercadoLibreListing({
        id: "MCO2000000002",
        title: "Marcadores por color",
        status: "paused",
        price: 18_000,
        variations: [
          {
            id: 101,
            seller_custom_field: "MAR-ROS-01",
            price: 18_500,
            available_quantity: 2,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        externalItemId: "MCO2000000002",
        externalVariationId: "101",
        sellerSku: "MAR-ROS-01",
        marketplacePrice: 18_500,
        status: MarketplaceListingStatus.PAUSED,
      }),
    ]);
  });
});
