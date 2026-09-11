import { describe, expect, it, vi } from "vitest";

import {
  buildMercadoLibreListingMetadata,
  getMercadoLibreListingMetadataVersion,
} from "@/lib/mercadolibre/listing-metadata";
import {
  LISTING_METADATA_CONFLICT_MESSAGE,
  updateMarketplaceListingMetadataGuarded,
} from "@/lib/mercadolibre/listing-metadata-writes";

describe("listing metadata builder", () => {
  it("merges into the stored JSON so unknown keys survive an edit", () => {
    const current = {
      attributes: [{ id: "BRAND", value_name: "Owala" }],
      source: "MERCADOLIBRE_IMPORT",
      currencyId: "COP",
      familyName: "Termo",
      version: 3,
    };
    const next = buildMercadoLibreListingMetadata({ current, imageUrls: ["https://img/a.jpg"] }) as Record<string, unknown>;
    expect(next).toMatchObject({
      source: "MERCADOLIBRE_IMPORT",
      currencyId: "COP",
      familyName: "Termo",
      media: { imageUrls: ["https://img/a.jpg"] },
      version: 4,
    });
    expect(next.attributes).toEqual([{ id: "BRAND", value_name: "Owala" }]);
  });

  it("stamps version 1 on metadata that never had one and drops keys that empty out", () => {
    const next = buildMercadoLibreListingMetadata({
      current: { attributes: [], media: { imageUrls: ["x"] } },
      imageUrls: [],
    }) as Record<string, unknown>;
    expect(next.version).toBe(1);
    expect(next).not.toHaveProperty("media");
    expect(getMercadoLibreListingMetadataVersion(null)).toBe(0);
    expect(getMercadoLibreListingMetadataVersion({ version: "3" })).toBe(0);
  });

  it("keeps a stored rejection unless asked to clear it", () => {
    const current = { attributes: [], publicationError: { kind: "review", step: "ficha", field: "BRAND", message: "x", code: null, at: "2026-09-11T00:00:00.000Z" } };
    expect(buildMercadoLibreListingMetadata({ current, familyName: "Otro" })).toMatchObject({ publicationError: { field: "BRAND" } });
    expect(buildMercadoLibreListingMetadata({ current, publicationError: null })).not.toHaveProperty("publicationError");
  });
});

describe("guarded metadata writes", () => {
  it("filters on the version it read and refuses when nothing matched", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = { marketplaceListing: { updateMany } } as never;
    await updateMarketplaceListingMetadataGuarded(prisma, { id: "l1", currentMetadata: { version: 7 }, data: { lastError: null } });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "l1", metadata: { path: "$.version", equals: 7 } }, data: { lastError: null } });

    updateMany.mockResolvedValue({ count: 0 });
    await expect(
      updateMarketplaceListingMetadataGuarded(prisma, { id: "l1", currentMetadata: { version: 7 }, data: {} }),
    ).rejects.toMatchObject({ statusCode: 409, message: LISTING_METADATA_CONFLICT_MESSAGE });
  });

  it("does not guard a listing that has no version yet", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await updateMarketplaceListingMetadataGuarded({ marketplaceListing: { updateMany } } as never, { id: "l1", currentMetadata: null, data: {} });
    expect(updateMany).toHaveBeenCalledWith({ where: { id: "l1" }, data: {} });
  });
});
