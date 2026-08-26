import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMercadoLibreAccessToken: vi.fn().mockResolvedValue("access-token"),
  requestMercadoLibreJson: vi.fn(
    async (_connectionId: string, resource: string, request: typeof fetch) => {
      const response = await request(
        `https://api.mercadolibre.com${resource}`,
        {
          headers: { Authorization: "Bearer access-token" },
          cache: "no-store",
        },
      );
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : null;
      return {
        ok: response.ok && payload !== null,
        status: response.status,
        payload,
      };
    },
  ),
}));

vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreAccessToken: mocks.getMercadoLibreAccessToken,
  requestMercadoLibreJson: mocks.requestMercadoLibreJson,
}));

import { publishMercadoLibreListing } from "@/lib/mercadolibre/listings";

describe("Mercado Libre listing publication", () => {
  it("uses the marketplace price and safety stock instead of the storefront price", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "MCO1234",
            children_categories: [],
            settings: { listing_allowed: true, item_conditions: ["new"] },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
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
            familyName: "Agenda kawaii",
            attributes: [{ id: "COLOR", value_name: "Rosado" }],
            saleConditions: {
              shippingMode: "me2",
              freeShipping: true,
              localPickUp: false,
              packageDimensions: {
                heightCm: 4,
                widthCm: 20,
                lengthCm: 28,
                weightGrams: 500,
              },
            },
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
    expect(request.mock.calls[0][0]).toBe(
      "https://api.mercadolibre.com/categories/MCO1234",
    );
    expect(request.mock.calls[1][0]).toBe(
      "https://api.mercadolibre.com/categories/MCO1234/attributes",
    );
    const itemRequest = request.mock.calls[2];
    expect(itemRequest[0]).toBe("https://api.mercadolibre.com/items");
    expect(JSON.parse(itemRequest[1].body)).toMatchObject({
      family_name: "Agenda kawaii",
      category_id: "MCO1234",
      price: 19_900,
      available_quantity: 3,
      seller_custom_field: "AGENDA-01",
      shipping: {
        mode: "me2",
        free_shipping: true,
        local_pick_up: false,
      },
      attributes: expect.arrayContaining([
        { id: "COLOR", value_name: "Rosado" },
        { id: "BRAND", value_name: "P de Papel" },
        { id: "MPN", value_name: "AGENDA-01" },
        { id: "GTIN", value_name: "7701234567890" },
      ]),
    });
    expect(JSON.parse(itemRequest[1].body)).not.toHaveProperty("title");
    expect(request.mock.calls[3][0]).toBe(
      "https://api.mercadolibre.com/items/MCO123/description",
    );
    expect(JSON.parse(request.mock.calls[3][1].body)).toEqual({
      plain_text: "Agenda kawaii",
    });
  });

  it("uses the product name as a safe family-name fallback for existing drafts", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "MCO1234",
            children_categories: [],
            settings: { listing_allowed: true, item_conditions: ["new"] },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
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

    await publishMercadoLibreListing(
      {
        id: "listing-id",
        connectionId: "connection-id",
        categoryId: "MCO1234",
        listingType: "gold_special",
        marketplacePrice: 19_900,
        stockSafetyBuffer: 0,
        metadata: { attributes: [] },
        product: {
          id: "product-id",
          name: "Agenda kawaii",
          description: "",
          stock: 5,
          sku: "AGENDA-01",
          brand: null,
          gtin: null,
          mpn: null,
          isArchived: false,
          images: [{ url: "https://images.example.com/agenda.jpg" }],
        },
      },
      request,
    );

    expect(JSON.parse(request.mock.calls[2][1].body)).toMatchObject({
      family_name: "Agenda kawaii",
    });
  });

  it("stops before creating an item when the selected category is not final", async () => {
    const request = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "MCO1234",
          children_categories: [{ id: "MCO1235" }],
        }),
        { status: 200 },
      ),
    );

    await expect(
      publishMercadoLibreListing(
        {
          id: "listing-id",
          connectionId: "connection-id",
          categoryId: "MCO1234",
          listingType: "gold_special",
          marketplacePrice: 19_900,
          stockSafetyBuffer: 0,
          metadata: { attributes: [] },
          product: {
            id: "product-id",
            name: "Agenda kawaii",
            description: "",
            stock: 5,
            sku: "AGENDA-01",
            brand: null,
            gtin: null,
            mpn: null,
            isArchived: false,
            images: [{ url: "https://images.example.com/agenda.jpg" }],
          },
        },
        request,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("muy general"),
      requiresDraftReview: true,
    });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft reviewable when Mercado Libre removed the category", async () => {
    const request = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "Category not found" }), {
        status: 404,
      }),
    );

    await expect(
      publishMercadoLibreListing(
        {
          id: "listing-id",
          connectionId: "connection-id",
          categoryId: "MCO1234",
          listingType: "gold_special",
          marketplacePrice: 19_900,
          stockSafetyBuffer: 0,
          metadata: { attributes: [] },
          product: {
            id: "product-id",
            name: "Agenda kawaii",
            description: "",
            stock: 5,
            sku: "AGENDA-01",
            brand: null,
            gtin: null,
            mpn: null,
            isArchived: false,
            images: [{ url: "https://images.example.com/agenda.jpg" }],
          },
        },
        request,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("ya no está disponible"),
      requiresDraftReview: true,
    });

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops before creating an item when a required category attribute is missing", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "MCO1234", children_categories: [] }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "COLOR",
              name: "Color",
              tags: { required: true },
            },
          ]),
          { status: 200 },
        ),
      );

    await expect(
      publishMercadoLibreListing(
        {
          id: "listing-id",
          connectionId: "connection-id",
          categoryId: "MCO1234",
          listingType: "gold_special",
          marketplacePrice: 19_900,
          stockSafetyBuffer: 0,
          metadata: { attributes: [] },
          product: {
            id: "product-id",
            name: "Agenda kawaii",
            description: "",
            stock: 5,
            sku: "AGENDA-01",
            brand: null,
            gtin: null,
            mpn: null,
            isArchived: false,
            images: [{ url: "https://images.example.com/agenda.jpg" }],
          },
        },
        request,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("campos obligatorios"),
      requiresDraftReview: true,
    });

    expect(request).toHaveBeenCalledTimes(2);
  });

  it("keeps the listing as a reviewable draft when no units remain after safety stock", async () => {
    const request = vi.fn();

    await expect(
      publishMercadoLibreListing(
        {
          id: "listing-id",
          connectionId: "connection-id",
          categoryId: "MCO1234",
          listingType: "gold_special",
          marketplacePrice: 19_900,
          stockSafetyBuffer: 2,
          metadata: { attributes: [] },
          product: {
            id: "product-id",
            name: "Agenda kawaii",
            description: "",
            stock: 2,
            sku: "AGENDA-01",
            brand: null,
            gtin: null,
            mpn: null,
            isArchived: false,
            images: [{ url: "https://images.example.com/agenda.jpg" }],
          },
        },
        request,
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("No hay unidades disponibles"),
      requiresDraftReview: true,
    });

    expect(request).not.toHaveBeenCalled();
  });
});
