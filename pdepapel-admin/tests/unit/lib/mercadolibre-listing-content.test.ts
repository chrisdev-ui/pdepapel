import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMercadoLibreAccessToken: vi.fn().mockResolvedValue("access-token"),
}));

const pictureChecks = vi.hoisted(() => ({
  inspect: vi.fn(async (urls: readonly string[]) =>
    urls.map((url) => ({ url, check: { ok: true, problems: [] as { code: string; message: string }[], belowRecommended: false } })),
  ),
}));
// Las reglas de fotos (JPG/PNG, ≤10 MB, ≥500 px) tienen su propia prueba; aquí todas pasan salvo que el caso diga otra cosa.
// El interruptor de escrituras tiene su propia prueba; aquí está apagado.
vi.mock("@/lib/mercadolibre/writes-switch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/writes-switch")>()),
  areMercadoLibreWritesPaused: vi.fn().mockResolvedValue(false),
  areMercadoLibreWritesPausedForStore: vi.fn().mockResolvedValue(false),
  assertMercadoLibreWritesAllowed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/mercadolibre/picture-fetch", () => ({ inspectRemotePictures: pictureChecks.inspect }));
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

  it("una publicación con paquete de fotos aprobado sincroniza ese paquete, no las fotos del producto", async () => {
    // Tanda ola-1 (2026-10-31): «Sincronizar contenido», editar la publicación o
    // una acción masiva reemplazaban en Mercado Libre el paquete aprobado.
    const pack = [
      "https://res.cloudinary.com/demo/image/upload/mlp2/portada.jpg",
      "https://res.cloudinary.com/demo/image/upload/mlp2/detalle.jpg",
    ];
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    pictureChecks.inspect.mockClear();
    await syncMercadoLibreListingContent(
      {
        id: "listing-id",
        connectionId: "connection-id",
        externalItemId: "MCO123",
        categoryId: "MCO1234",
        listingType: "gold_special",
        marketplacePrice: 19_900,
        stockSafetyBuffer: 1,
        metadata: { media: { imageUrls: ["https://images.example.com/cover.jpg"], packPictures: pack } },
        product: {
          id: "product-id",
          name: "Agenda kawaii",
          description: "Agenda",
          stock: 5,
          sku: "AGENDA-01",
          brand: "P de Papel",
          gtin: null,
          mpn: null,
          isArchived: false,
          images: [{ url: "https://images.example.com/cover.jpg" }, { url: "https://images.example.com/detail.jpg" }],
        },
      } as never,
      request,
    );
    expect(JSON.parse(request.mock.calls[1][1].body).pictures).toEqual(pack.map((source) => ({ source })));
    expect(pictureChecks.inspect.mock.calls[0][0]).toEqual(pack);
  });

  // Sin marca en el panel ni texto anterior: no se manda BRAND propio; queda el valor que ya tiene Mercado Libre.
  async function syncWithoutBrand(remoteAttributes: unknown[]) {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: remoteAttributes }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    await syncMercadoLibreListingContent(
      {
        id: "listing-id",
        connectionId: "connection-id",
        externalItemId: "MCO123",
        categoryId: "MCO1234",
        listingType: "gold_special",
        marketplacePrice: 19_900,
        stockSafetyBuffer: 1,
        metadata: { attributes: [{ id: "COLOR", value_name: "Rosado" }] },
        product: {
          id: "product-id",
          name: "Agenda kawaii",
          description: "Agenda",
          stock: 5,
          sku: "AGENDA-01",
          brand: null,
          brandRef: null,
          productGroup: null,
          gtin: null,
          mpn: null,
          isArchived: false,
          images: [{ url: "https://images.example.com/cover.jpg" }],
        },
      } as never,
      request,
    );
    return (JSON.parse(request.mock.calls[1][1].body) as { attributes: { id: string; value_name?: string }[] }).attributes;
  }

  it("sin marca en el panel conserva el BRAND que ya tiene Mercado Libre", async () => {
    const attributes = await syncWithoutBrand([{ id: "BRAND", value_name: "Genérica" }]);
    expect(attributes.filter((attribute) => attribute.id === "BRAND")).toEqual([{ id: "BRAND", value_name: "Genérica" }]);
  });

  it("sin marca en ninguna parte no manda BRAND vacío ni inventado", async () => {
    const attributes = await syncWithoutBrand([{ id: "BRAND", value_name: "" }, { id: "MATERIAL", value_name: "Plástico" }]);
    expect(attributes.some((attribute) => attribute.id === "BRAND")).toBe(false);
  });

  async function syncWith(remoteAttributes: unknown[], configured: unknown[], brandRef: unknown) {
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ attributes: remoteAttributes }), { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 201 }));
    await syncMercadoLibreListingContent(
      {
        id: "listing-id",
        connectionId: "connection-id",
        externalItemId: "MCO123",
        categoryId: "MCO1234",
        listingType: "gold_special",
        marketplacePrice: 19_900,
        stockSafetyBuffer: 1,
        metadata: { attributes: configured },
        product: {
          id: "product-id",
          name: "Agenda kawaii",
          description: "Agenda",
          stock: 5,
          sku: "AGENDA-01",
          brand: null,
          brandRef,
          productGroup: null,
          gtin: null,
          mpn: null,
          isArchived: false,
          images: [{ url: "https://images.example.com/cover.jpg" }],
        },
      } as never,
      request,
    );
    const attributes = (JSON.parse(request.mock.calls[1][1].body) as { attributes: { id: string; value_name?: string }[] }).attributes;
    return (id: string) => attributes.filter((attribute) => attribute.id === id).map((attribute) => attribute.value_name);
  }

  const primavera = { name: "Flower Power", isArchived: false, parent: { name: "Primavera", isArchived: false } };

  it("al editar no cambia un BRAND ni una LINE que la publicación ya tiene", async () => {
    const values = await syncWith(
      [{ id: "BRAND", value_name: "Fashion" }, { id: "LINE", value_name: "Clásica" }],
      [{ id: "LINE", value_name: "Flower Power" }],
      primavera,
    );
    expect(values("BRAND")).toEqual(["Fashion"]);
    expect(values("LINE")).toEqual(["Clásica"]);
  });

  it("al editar una publicación sin BRAND ni LINE sí manda los del panel", async () => {
    const values = await syncWith([{ id: "MATERIAL", value_name: "Plástico" }], [{ id: "LINE", value_name: "Flower Power" }], primavera);
    expect(values("BRAND")).toEqual(["Primavera"]);
    expect(values("LINE")).toEqual(["Flower Power"]);
  });
});
