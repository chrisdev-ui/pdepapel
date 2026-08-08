import { describe, expect, it } from "vitest";

import { getMercadoLibreListingImageUrls } from "@/lib/mercadolibre/listing-metadata";
import { parseMercadoLibreListingPriceEstimate } from "@/lib/mercadolibre/listing-pricing";
import { parseMercadoLibreListingQuality } from "@/lib/mercadolibre/listing-quality";

describe("Mercado Libre listing insights", () => {
  it("uses only selected images that still belong to the local product", () => {
    expect(
      getMercadoLibreListingImageUrls(
        [
          { url: "https://images.example.com/cover.jpg" },
          { url: "https://images.example.com/detail.jpg" },
        ],
        {
          media: {
            imageUrls: [
              "https://images.example.com/detail.jpg",
              "https://invalid.example.com/nope.jpg",
            ],
          },
        },
      ),
    ).toEqual(["https://images.example.com/detail.jpg"]);
  });

  it("extracts official fee details without treating them as final settlement", () => {
    expect(
      parseMercadoLibreListingPriceEstimate({
        listing_type_id: "gold_special",
        listing_type_name: "Clásica",
        sale_fee_amount: 13_110,
        sale_fee_details: { percentage_fee: 19, fixed_fee: 0 },
      }),
    ).toEqual({
      listingTypeId: "gold_special",
      listingTypeName: "Clásica",
      saleFeeAmount: 13_110,
      percentageFee: 19,
      fixedFee: 0,
    });
  });

  it("surfaces only unresolved quality actions", () => {
    expect(
      parseMercadoLibreListingQuality({
        score: 67,
        level: "Good",
        level_wording: "Profesional",
        buckets: [
          {
            variables: [
              {
                title: "Fotos",
                rules: [
                  {
                    status: "PENDING",
                    mode: "OPPORTUNITY",
                    wordings: { title: "Agrega más fotos", label: "Agregar" },
                  },
                  {
                    status: "COMPLETED",
                    wordings: { title: "No debe mostrarse" },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      score: 67,
      level: "Good",
      levelWording: "Profesional",
      pendingRules: [
        {
          title: "Agrega más fotos",
          label: "Agregar",
          mode: "OPPORTUNITY",
        },
      ],
    });
  });
});
