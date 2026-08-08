import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMercadoLibreAccessToken: vi.fn().mockResolvedValue("access-token"),
}));

vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreAccessToken: mocks.getMercadoLibreAccessToken,
}));

import { syncMercadoLibreListingContent } from "@/lib/mercadolibre/listings";

describe("Mercado Libre listing content synchronization", () => {
  it("only publishes selected local images and preserves remote attributes", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            attributes: [{ id: "MATERIAL", value_name: "Plástico" }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));

    await expect(
      syncMercadoLibreListingContent(
        {
          id: "listing-id",
          connectionId: "connection-id",
          externalItemId: "MCO123",
          categoryId: "MCO1234",
          listingType: "gold_special",
          marketplacePrice: 19_900,
          stockSafetyBuffer: 1,
          metadata: {
            attributes: [{ id: "COLOR", value_name: "Rosado" }],
            media: { imageUrls: ["https://images.example.com/detail.jpg"] },
          },
          product: {
            id: "product-id",
            name: "Agenda kawaii",
            description: "<p>Agenda <strong>kawaii</strong></p>",
            stock: 5,
            sku: "AGENDA-01",
            brand: "P de Papel",
            gtin: null,
            mpn: null,
            isArchived: false,
            images: [
              { url: "https://images.example.com/cover.jpg" },
              { url: "https://images.example.com/detail.jpg" },
            ],
          },
        },
        request,
      ),
    ).resolves.toBeUndefined();

    expect(mocks.getMercadoLibreAccessToken).toHaveBeenCalledWith(
      "connection-id",
    );
    expect(request.mock.calls[1][0]).toBe(
      "https://api.mercadolibre.com/items/MCO123",
    );
    expect(JSON.parse(request.mock.calls[1][1].body)).toMatchObject({
      pictures: [{ source: "https://images.example.com/detail.jpg" }],
      attributes: expect.arrayContaining([
        { id: "MATERIAL", value_name: "Plástico" },
        { id: "COLOR", value_name: "Rosado" },
        { id: "BRAND", value_name: "P de Papel" },
      ]),
    });
    expect(request.mock.calls[3][0]).toBe(
      "https://api.mercadolibre.com/items/MCO123/description",
    );
    expect(JSON.parse(request.mock.calls[3][1].body)).toEqual({
      plain_text: "Agenda kawaii",
    });
  });
});
