import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildMercadoLibreListingMetadata,
  getMercadoLibreListingImageUrls,
  getMercadoLibreListingMetadata,
} from "@/lib/mercadolibre/listing-metadata";
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
                key: "ITEM_PICTURES",
                title: "Fotos",
                rules: [
                  {
                    key: "ADD_IMAGES",
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
          key: "ADD_IMAGES",
          link: null,
          title: "Agrega más fotos",
          label: "Agregar",
          mode: "OPPORTUNITY",
          isVideoRecommendation: false,
        },
      ],
    });
  });

  it("identifies a video opportunity and keeps only Mercado Libre links", () => {
    expect(
      parseMercadoLibreListingQuality({
        score: 80,
        buckets: [
          {
            variables: [
              {
                key: "ITEM_VIDEO",
                title: "Video",
                rules: [
                  {
                    key: "ADD_VIDEO",
                    status: "PENDING",
                    mode: "OPPORTUNITY",
                    wordings: {
                      title: "Agrega un video del producto",
                      label: "Subir video",
                      link: "https://www.mercadolibre.com.co/publicaciones/video",
                    },
                  },
                  {
                    key: "UNTRUSTED",
                    status: "PENDING",
                    wordings: {
                      title: "Video de otro sitio",
                      link: "https://example.com/video",
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toMatchObject({
      pendingRules: [
        {
          key: "ADD_VIDEO",
          link: "https://www.mercadolibre.com.co/publicaciones/video",
          isVideoRecommendation: true,
        },
        {
          key: "UNTRUSTED",
          link: null,
          isVideoRecommendation: true,
        },
      ],
    });
  });

  it("preserves a video recommendation reminder while editing listing media", () => {
    const metadata = buildMercadoLibreListingMetadata({
      current: {
        media: { imageUrls: ["https://images.example.com/cover.jpg"] },
        quality: {
          videoRecommendationSnoozedUntil: "2026-09-07T00:00:00.000Z",
        },
      },
      imageUrls: ["https://images.example.com/cover.jpg"],
    });

    expect(
      getMercadoLibreListingMetadata(metadata as unknown as Prisma.JsonValue)
        .quality,
    ).toEqual({
      videoRecommendationSnoozedUntil: "2026-09-07T00:00:00.000Z",
    });
  });
});
