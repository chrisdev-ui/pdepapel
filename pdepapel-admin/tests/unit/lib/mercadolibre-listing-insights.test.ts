import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildMercadoLibreListingMetadata,
  getMercadoLibreListingImageUrls,
  getMercadoLibreListingMetadata,
} from "@/lib/mercadolibre/listing-metadata";
import {
  addMercadoLibreInstallmentTerms,
  parseMercadoLibreListingPriceEstimate,
} from "@/lib/mercadolibre/listing-pricing";
import { parseMercadoLibreListingQuality } from "@/lib/mercadolibre/listing-quality";
import {
  parseMercadoLibreAvailableListingTypes,
  parseMercadoLibreRemoteSaleConditions,
} from "@/lib/mercadolibre/sale-conditions";
import { parseMercadoLibreShippingCostEstimate } from "@/lib/mercadolibre/shipping-cost";

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
        listing_fee_amount: 0,
        listing_exposure: "highest",
        sale_fee_details: {
          percentage_fee: 19,
          fixed_fee: 0,
          financing_add_on_fee: 2_070,
        },
      }),
    ).toEqual({
      listingTypeId: "gold_special",
      listingTypeName: "Clásica",
      saleFeeAmount: 13_110,
      percentageFee: 19,
      fixedFee: 0,
      financingAddOnFee: 2_070,
      listingFeeAmount: 0,
      listingExposure: "highest",
      installmentCount: null,
      installmentLabel: null,
    });
  });

  it("labels the installment plans used by Mercado Libre Colombia", () => {
    const estimate = parseMercadoLibreListingPriceEstimate({
      listing_type_id: "gold_pro",
      listing_type_name: "Premium",
      sale_fee_amount: 31_304,
      sale_fee_details: { financing_add_on_fee: 4_368 },
    });

    expect(
      estimate ? addMercadoLibreInstallmentTerms(estimate, "MCO") : null,
    ).toMatchObject({
      listingTypeId: "gold_pro",
      installmentCount: 6,
      installmentLabel: "Hasta 6 cuotas con 0% interés",
    });
  });

  it("reads active shipping and allowed listing types from Mercado Libre", () => {
    expect(
      parseMercadoLibreRemoteSaleConditions({
        listing_type_id: "gold_special",
        category_id: "MCO123",
        price: 69_000,
        shipping: {
          mode: "me2",
          logistic_type: "drop_off",
          free_shipping: true,
          local_pick_up: false,
          tags: ["mandatory_free_shipping"],
        },
      }),
    ).toEqual({
      listingType: "gold_special",
      categoryId: "MCO123",
      price: 69_000,
      shippingMode: "me2",
      logisticType: "drop_off",
      freeShipping: true,
      localPickUp: false,
      tags: ["mandatory_free_shipping"],
      mandatoryFreeShipping: true,
    });
    expect(
      parseMercadoLibreAvailableListingTypes([
        { id: "gold_special" },
        { id: "gold_pro" },
        { id: "gold_pro" },
      ]),
    ).toEqual(["gold_special", "gold_pro"]);
  });

  it("extracts the seller shipping cost from the official coverage", () => {
    expect(
      parseMercadoLibreShippingCostEstimate({
        coverage: {
          all_country: {
            billable_weight: 1_000,
            currency_id: "COP",
            list_cost: 8_500,
            discount: { rate: 10, promoted_amount: 7_650 },
          },
        },
      }),
    ).toEqual({
      sellerCost: 8_500,
      currencyId: "COP",
      billableWeightGrams: 1_000,
      discountRate: 10,
      promotedAmount: 7_650,
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
        familyName: "Agenda de estudio",
        media: { imageUrls: ["https://images.example.com/cover.jpg"] },
        quality: {
          videoRecommendationSnoozedUntil: "2026-09-07T00:00:00.000Z",
        },
      },
      imageUrls: ["https://images.example.com/cover.jpg"],
    });

    const parsed = getMercadoLibreListingMetadata(
      metadata as unknown as Prisma.JsonValue,
    );

    expect(parsed.familyName).toBe("Agenda de estudio");
    expect(parsed.quality).toEqual({
      videoRecommendationSnoozedUntil: "2026-09-07T00:00:00.000Z",
    });
  });

  it("preserves reviewed shipping conditions in listing metadata", () => {
    const metadata = buildMercadoLibreListingMetadata({
      current: null,
      saleConditions: {
        shippingMode: "me2",
        freeShipping: true,
        localPickUp: false,
        packageDimensions: {
          heightCm: 8,
          widthCm: 20,
          lengthCm: 30,
          weightGrams: 650,
        },
      },
    });

    expect(
      getMercadoLibreListingMetadata(metadata as unknown as Prisma.JsonValue)
        .saleConditions,
    ).toEqual({
      shippingMode: "me2",
      freeShipping: true,
      localPickUp: false,
      packageDimensions: {
        heightCm: 8,
        widthCm: 20,
        lengthCm: 30,
        weightGrams: 650,
      },
    });
  });
});
