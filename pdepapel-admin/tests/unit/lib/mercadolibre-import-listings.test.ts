import { MarketplaceListingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  getMercadoLibreListingImportSelectionError,
  parseMercadoLibreListing,
} from "@/lib/mercadolibre/import-listings";

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

  it("rejects linking one local product to multiple publications", () => {
    expect(
      getMercadoLibreListingImportSelectionError([
        {
          externalItemId: "MCO2000000001",
          externalVariationId: null,
          productId: "local-product-id",
        },
        {
          externalItemId: "MCO2000000002",
          externalVariationId: null,
          productId: "local-product-id",
        },
      ]),
    ).toBe(
      "Un mismo producto local fue elegido para varias publicaciones. Deja una sola publicación vinculada a cada producto y revisa las demás.",
    );
  });

  it("rejects selecting the same Mercado Libre variation twice", () => {
    expect(
      getMercadoLibreListingImportSelectionError([
        {
          externalItemId: "MCO2000000001",
          externalVariationId: "123",
          productId: "local-product-a",
        },
        {
          externalItemId: "MCO2000000001",
          externalVariationId: "123",
          productId: "local-product-b",
        },
      ]),
    ).toBe("Una misma publicación o variación fue seleccionada más de una vez");
  });
});
