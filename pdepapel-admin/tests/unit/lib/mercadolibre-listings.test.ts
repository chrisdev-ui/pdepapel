import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMercadoLibreAccessToken: vi.fn().mockResolvedValue("access-token"),
}));

vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreAccessToken: mocks.getMercadoLibreAccessToken,
}));

import { publishMercadoLibreListing } from "@/lib/mercadolibre/listings";

describe("Mercado Libre listing publication", () => {
  it("uses the marketplace price and safety stock instead of the storefront price", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "MCO123",
            permalink: "https://mercadolibre.com.co/MCO123",
            status: "active",
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));

    await expect(
      publishMercadoLibreListing(
        {
          id: "listing-id",
          connectionId: "connection-id",
          categoryId: "MCO1234",
          listingType: "gold_special",
          marketplacePrice: 19_900,
          stockSafetyBuffer: 2,
          metadata: {
            attributes: [{ id: "COLOR", value_name: "Rosado" }],
          },
          product: {
            id: "product-id",
            name: "Agenda kawaii",
            description: "<p>Agenda <strong>kawaii</strong></p>",
            stock: 5,
            sku: "AGENDA-01",
            brand: "P de Papel",
            gtin: "7701234567890",
            mpn: "AGENDA-01",
            isArchived: false,
            images: [{ url: "https://images.example.com/agenda.jpg" }],
          },
        },
        request,
      ),
    ).resolves.toEqual({
      id: "MCO123",
      permalink: "https://mercadolibre.com.co/MCO123",
      status: "active",
      descriptionWarning: null,
    });

    expect(mocks.getMercadoLibreAccessToken).toHaveBeenCalledWith(
      "connection-id",
    );
    const itemRequest = request.mock.calls[0];
    expect(itemRequest[0]).toBe("https://api.mercadolibre.com/items");
    expect(JSON.parse(itemRequest[1].body)).toMatchObject({
      category_id: "MCO1234",
      price: 19_900,
      available_quantity: 3,
      seller_custom_field: "AGENDA-01",
      attributes: expect.arrayContaining([
        { id: "COLOR", value_name: "Rosado" },
        { id: "BRAND", value_name: "P de Papel" },
        { id: "MPN", value_name: "AGENDA-01" },
        { id: "GTIN", value_name: "7701234567890" },
      ]),
    });
    expect(request.mock.calls[1][0]).toBe(
      "https://api.mercadolibre.com/items/MCO123/description",
    );
    expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({
      plain_text: "Agenda kawaii",
    });
  });
});
