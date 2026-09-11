import { MarketplaceListingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requestJson: vi.fn(),
  getJson: vi.fn(),
  findListings: vi.fn(),
  findProducts: vi.fn(),
  transactionListings: { findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  queueStock: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@/lib/mercadolibre/client", () => ({
  requestMercadoLibreJson: mocks.requestJson,
  getMercadoLibreJson: mocks.getJson,
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  queueMarketplaceStockSyncEvents: mocks.queueStock,
  enqueuePendingMarketplaceOutboxEvents: mocks.enqueue,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: { findMany: mocks.findListings },
    product: { findMany: mocks.findProducts },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        product: { findMany: mocks.findProducts },
        marketplaceListing: mocks.transactionListings,
      }),
    ),
  },
}));

import {
  getMercadoLibreListingImportSelectionError,
  getRemoteListingsByIds,
  importMercadoLibreListings,
  parseMercadoLibreListing,
  previewMercadoLibreListingImport,
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

  it("maps review and payment states through the shared status table and flags catalog listings", () => {
    const [listing] = parseMercadoLibreListing({ id: "MCO3", title: "En revisión", status: "under_review", price: 1000, catalog_listing: true, currency_id: "COP" });
    expect(listing).toMatchObject({ status: MarketplaceListingStatus.PAUSED, catalogListing: true, currencyId: "COP" });
    expect(listing.statusNote).toMatch(/revisando/);
  });

  describe("remote detail fetch", () => {
    beforeEach(() => vi.clearAllMocks());

    it("keeps the items of a failed batch as unavailable instead of failing the whole read", async () => {
      const ids = Array.from({ length: 25 }, (_, i) => `MCO${i}`);
      mocks.requestJson.mockImplementation(async (_c: string, resource: string) =>
        resource.includes("MCO20")
          ? { ok: false, status: 429, payload: null }
          : { ok: true, status: 200, payload: ids.filter((id) => resource.includes(id)).map((id) => ({ code: 200, body: { id, title: id, status: "active", price: 10 } })) },
      );
      const result = await getRemoteListingsByIds("conn", ids);
      expect(result.listings).toHaveLength(20);
      expect(result.unavailableItemIds).toEqual(ids.slice(20));
    });

    it("stops on an expired authorization", async () => {
      mocks.requestJson.mockResolvedValue({ ok: false, status: 401, payload: null });
      await expect(getRemoteListingsByIds("conn", ["MCO1"])).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  describe("preview", () => {
    beforeEach(() => vi.clearAllMocks());

    it("warns about a local draft, a foreign currency and reports partial results", async () => {
      mocks.getJson.mockResolvedValue({ results: ["MCO1", "MCO2"], paging: { total: 2 } });
      mocks.requestJson.mockResolvedValue({
        ok: true,
        status: 200,
        payload: [
          { body: { id: "MCO1", title: "Termo", status: "active", price: 10, seller_custom_field: "SKU-1", currency_id: "USD" } },
        ],
      });
      mocks.findListings
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: "draft-1", productId: "prod-1", title: "Borrador" }]);
      mocks.findProducts.mockResolvedValue([{ id: "prod-1", name: "Termo local", sku: "SKU-1", stock: 3 }]);

      const preview = await previewMercadoLibreListingImport("conn", "store", "seller");
      expect(preview.partial).toBe(true);
      expect(preview.summary.unavailable).toBe(1);
      expect(preview.listings[0]).toMatchObject({ suggestedProduct: { id: "prod-1" }, draftListingId: "draft-1", issue: null });
      expect(preview.listings[0].warnings).toEqual([
        expect.stringMatching(/borrador/),
        expect.stringMatching(/USD/),
      ]);
    });
  });

  describe("import", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mocks.enqueue.mockResolvedValue(1);
      mocks.requestJson.mockResolvedValue({
        ok: true,
        status: 200,
        payload: [{ body: { id: "MCO1", title: "Termo", status: "active", price: 10, available_quantity: 4, currency_id: "COP" } }],
      });
      mocks.findProducts.mockResolvedValue([{ id: "prod-1", stock: 5 }]);
      mocks.transactionListings.findMany.mockResolvedValue([]);
      mocks.transactionListings.create.mockResolvedValue({ id: "new-1" });
      mocks.transactionListings.update.mockResolvedValue({ id: "draft-1" });
    });

    it("refuses to overwrite a draft unless the row confirmed it, then updates it in place", async () => {
      mocks.transactionListings.findMany
        .mockResolvedValueOnce([{ id: "draft-1", productId: "prod-1", externalItemId: null, externalVariationId: null, stockSafetyBuffer: 1, metadata: { attributes: [], familyName: "Mi termo" } }])
        .mockResolvedValueOnce([]);
      await expect(
        importMercadoLibreListings({ connectionId: "conn", storeId: "store", sellerId: "s", selections: [{ externalItemId: "MCO1", externalVariationId: null, productId: "prod-1" }] }),
      ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/«Termo» \(MCO1\).*borrador/) });

      mocks.transactionListings.findMany
        .mockResolvedValueOnce([{ id: "draft-1", productId: "prod-1", externalItemId: null, externalVariationId: null, stockSafetyBuffer: 1, metadata: { attributes: [], familyName: "Mi termo" } }])
        .mockResolvedValueOnce([]);
      const result = await importMercadoLibreListings({ connectionId: "conn", storeId: "store", sellerId: "s", selections: [{ externalItemId: "MCO1", externalVariationId: null, productId: "prod-1", replaceDraft: true }] });
      expect(result.imported).toEqual([{ listingId: "draft-1", externalItemId: "MCO1", externalVariationId: null, title: "Termo", replacedDraft: true }]);
      const update = mocks.transactionListings.update.mock.calls[0][0];
      expect(update.data.metadata).toMatchObject({ familyName: "Mi termo", source: "MERCADOLIBRE_IMPORT", currencyId: "COP" });
      expect(update.data).toMatchObject({ externalItemId: "MCO1", syncPrice: false, lastSyncedStock: 4 });
      expect(mocks.queueStock).toHaveBeenCalledWith(expect.anything(), ["prod-1"]);
    });

    it("names the item that no longer exists and reads only the selected ids", async () => {
      mocks.requestJson.mockResolvedValue({ ok: true, status: 200, payload: [] });
      await expect(
        importMercadoLibreListings({ connectionId: "conn", storeId: "store", sellerId: "s", selections: [{ externalItemId: "MCO9", externalVariationId: null, productId: "prod-1" }] }),
      ).rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/MCO9/) });
      expect(mocks.getJson).not.toHaveBeenCalled();
    });
  });
});
