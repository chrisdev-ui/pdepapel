import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
  importListings: vi.fn(),
  preview: vi.fn(),
  queueStatus: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));
vi.mock("@/lib/prismadb", () => ({
  default: { marketplaceConnection: { findUnique: mocks.findUnique } },
}));
vi.mock("@/lib/mercadolibre/import-listings", () => ({
  importMercadoLibreListings: mocks.importListings,
  previewMercadoLibreListingImport: mocks.preview,
}));
vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreQueueConfigurationStatus: mocks.queueStatus,
}));

import { POST as importListings } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/import/route";
import { POST as preview } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/import/preview/route";

describe("Mercado Libre listing import routes", () => {
  it("reviews existing listings without modifying the catalog", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findUnique.mockResolvedValue({
      id: "connection-id",
      sellerId: "seller-id",
      status: "CONNECTED",
    });
    mocks.preview.mockResolvedValue({ listings: [], summary: {} });

    const response = await preview(
      new Request("https://admin.example.com", { method: "POST" }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith(
      "connection-id",
      "store-id",
      "seller-id",
    );
    expect(mocks.importListings).not.toHaveBeenCalled();
  });

  it("allows an owner to submit a manual product link", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findUnique.mockResolvedValue({
      id: "connection-id",
      sellerId: "seller-id",
      status: "CONNECTED",
      recoveryScheduleId: "schedule-id",
    });
    mocks.queueStatus.mockReturnValue({ configured: true, missing: [] });
    mocks.importListings.mockResolvedValue({ importedCount: 1 });

    const response = await importListings(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          selections: [
            {
              externalItemId: "MCO2000000001",
              externalVariationId: null,
              productId: "local-product-id",
            },
          ],
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(201);
    expect(mocks.importListings).toHaveBeenCalledWith({
      connectionId: "connection-id",
      storeId: "store-id",
      sellerId: "seller-id",
      selections: [
        {
          externalItemId: "MCO2000000001",
          externalVariationId: null,
          productId: "local-product-id",
        },
      ],
    });
  });
});
