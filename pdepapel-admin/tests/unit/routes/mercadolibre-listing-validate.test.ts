import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findListing: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner, CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/prismadb", () => ({ default: { marketplaceListing: { findFirst: mocks.findListing } } }));
vi.mock("@/lib/mercadolibre/listings", () => ({
  LISTING_FOR_PUBLICATION_SELECT: { id: true },
  validateMercadoLibreItemDraft: mocks.validate,
}));

import { POST } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/validate/route";

const params = { storeId: "store-1", listingId: "listing-1" };
const draft = { id: "listing-1", externalItemId: null, connection: { status: "CONNECTED" } };

describe("POST /marketplaces/mercadolibre/listings/[id]/validate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.findListing.mockResolvedValue(draft);
  });

  it("returns Mercado Libre's verdict for the saved draft, scoped to the store", async () => {
    mocks.validate.mockResolvedValue({ ok: false, errors: [{ kind: "review", step: "ficha", field: "GTIN", code: "x", message: "m" }], warnings: [] });
    const response = await POST(new Request("http://x", { method: "POST" }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: false, errors: [{ field: "GTIN" }] });
    expect(mocks.findListing).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "listing-1", connection: { storeId: "store-1" } } }));
    expect(mocks.validate).toHaveBeenCalledWith(draft);
  });

  it("only the store owner can validate", async () => {
    mocks.verifyStoreOwner.mockRejectedValue(Object.assign(new Error("No"), { statusCode: 403 }));
    const response = await POST(new Request("http://x", { method: "POST" }), { params });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });

  it("refuses a listing that is already on Mercado Libre or a disconnected account", async () => {
    mocks.findListing.mockResolvedValueOnce({ ...draft, externalItemId: "MCO1" });
    expect((await POST(new Request("http://x", { method: "POST" }), { params })).status).toBe(409);
    mocks.findListing.mockResolvedValueOnce({ ...draft, connection: { status: "REAUTH_REQUIRED" } });
    expect((await POST(new Request("http://x", { method: "POST" }), { params })).status).toBe(400);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
