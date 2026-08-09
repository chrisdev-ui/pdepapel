import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findCategory: vi.fn(),
  findProfiles: vi.fn(),
  upsertProfile: vi.fn(),
  verifyStoreOwner: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  CACHE_HEADERS: { NO_CACHE: { "Cache-Control": "no-store" } },
  verifyStoreOwner: mocks.verifyStoreOwner,
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    category: { findFirst: mocks.findCategory },
    marketplacePublicationProfile: {
      findMany: mocks.findProfiles,
      upsert: mocks.upsertProfile,
    },
  },
}));

import {
  GET,
  POST,
} from "@/app/api/[storeId]/marketplaces/mercadolibre/profiles/route";

describe("Mercado Libre publication profiles routes", () => {
  it("returns only profiles owned by the current store", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findProfiles.mockResolvedValue([]);

    const response = await GET(new Request("https://admin.example.com"), {
      params: { storeId: "store-id" },
    });

    expect(response.status).toBe(200);
    expect(mocks.findProfiles).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: "store-id" } }),
    );
  });

  it("upserts an editable profile only for a local category in the store", async () => {
    mocks.auth.mockReturnValue({ userId: "owner-id" });
    mocks.findCategory.mockResolvedValue({ id: "local-category-id" });
    mocks.upsertProfile.mockResolvedValue({
      id: "profile-id",
      localCategoryId: "local-category-id",
    });

    const response = await POST(
      new Request("https://admin.example.com", {
        method: "POST",
        body: JSON.stringify({
          localCategoryId: "local-category-id",
          categoryId: "MCO123",
          name: "Lapiceros · Mercado Libre",
          attributes: [{ id: "BRAND", value_name: "P de Papel" }],
          stockSafetyBuffer: 1,
          minimumMarginAmount: 12_000,
        }),
      }),
      { params: { storeId: "store-id" } },
    );

    expect(response.status).toBe(201);
    expect(mocks.findCategory).toHaveBeenCalledWith({
      where: { id: "local-category-id", storeId: "store-id" },
      select: { id: true },
    });
    expect(mocks.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId_localCategoryId: {
            storeId: "store-id",
            localCategoryId: "local-category-id",
          },
        },
      }),
    );
  });
});
