import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findListing: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateMany: vi.fn(),
  deleteListing: vi.fn(),
  deleteEvents: vi.fn(),
  queueStatus: vi.fn(),
  queuePrice: vi.fn(),
  queueContent: vi.fn(),
  queueStock: vi.fn(),
  enqueue: vi.fn(),
  inProgress: vi.fn(),
  evaluatePrice: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: {
      findFirst: mocks.findListing,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      updateMany: mocks.updateMany,
      delete: mocks.deleteListing,
    },
    marketplaceOutboxEvent: { deleteMany: mocks.deleteEvents },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => Promise<unknown>)({
            marketplaceListing: { updateMany: mocks.updateMany, findUniqueOrThrow: mocks.findUniqueOrThrow },
          })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
}));
vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreQueueConfigurationStatus: mocks.queueStatus,
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  enqueuePendingMarketplaceOutboxEvents: mocks.enqueue,
  isMarketplaceListingPublicationInProgress: mocks.inProgress,
  queueMarketplaceListingContentSyncEvent: mocks.queueContent,
  queueMarketplacePriceSyncEvent: mocks.queuePrice,
  queueMarketplaceStockSyncEvents: mocks.queueStock,
}));
vi.mock("@/lib/mercadolibre/category-validation", () => ({
  inspectMercadoLibreCategory: vi.fn(async () => ({ ok: true, categoryId: "MCO1", attributes: [], path: [] })),
}));
vi.mock("@/lib/mercadolibre/listing-price-guard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/listing-price-guard")>()),
  evaluateListingPrice: mocks.evaluatePrice,
}));

import { DELETE, PATCH } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/route";

const params = { storeId: "store-1", listingId: "listing-1" };
const patch = (body: unknown) =>
  PATCH(
    new Request("https://admin.test/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params },
  );

const published = {
  id: "listing-1",
  connectionId: "conn",
  productId: "product-1",
  externalItemId: "MCO1",
  marketplacePrice: 10000,
  syncPrice: true,
  syncStock: true,
  stockSafetyBuffer: 0,
  metadata: { attributes: [], version: 2 },
  connection: { status: "CONNECTED", recoveryScheduleId: "s" },
  product: { acqPrice: 4000, transportationCost: 1000, images: [{ url: "https://img/a.jpg" }] },
};

describe("PATCH /marketplaces/mercadolibre/listings/[listingId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.queueStatus.mockReturnValue({ configured: true });
    mocks.inProgress.mockResolvedValue(false);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.findUniqueOrThrow.mockResolvedValue({ ...published, marketplacePrice: 12000 });
    mocks.evaluatePrice.mockReturnValue({ ok: true, belowCost: false, override: null });
  });

  it("rejects an empty edit", async () => {
    mocks.findListing.mockResolvedValue(published);
    const response = await patch({});
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "No hay cambios para guardar" });
  });

  it("queues a content sync when content fields change on a published listing", async () => {
    mocks.findListing.mockResolvedValue(published);
    mocks.findUniqueOrThrow.mockResolvedValue(published);
    const response = await patch({ familyName: "Termo Owala" });
    expect(response.status).toBe(200);
    expect(mocks.queueContent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ listingId: "listing-1" }));
    expect(mocks.enqueue).toHaveBeenCalledWith("conn");
  });

  it("queues a stock sync when the safety buffer changes on a published listing that syncs stock", async () => {
    mocks.findListing.mockResolvedValue(published);
    mocks.findUniqueOrThrow.mockResolvedValue({ ...published, stockSafetyBuffer: 2 });
    await patch({ stockSafetyBuffer: 2 });
    expect(mocks.queueStock).toHaveBeenCalledWith(expect.anything(), ["product-1"]);
    expect(mocks.queueContent).not.toHaveBeenCalled();
  });

  it("refuses to edit a published listing when the queue is not configured", async () => {
    mocks.findListing.mockResolvedValue(published);
    mocks.queueStatus.mockReturnValue({ configured: false });
    const response = await patch({ familyName: "x" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/procesamiento seguro/) });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("clears a stored rejection when the rejected step is edited", async () => {
    const rejected = {
      ...published,
      externalItemId: null,
      metadata: { attributes: [], version: 1, publicationError: { kind: "review", step: "ficha", field: "BRAND", message: "Falta marca", code: null, at: "2026-09-11T00:00:00.000Z" } },
    };
    mocks.findListing.mockResolvedValue(rejected);
    mocks.findUniqueOrThrow.mockResolvedValue(rejected);
    await patch({ attributes: [{ id: "BRAND", value_name: "Owala" }] });
    const data = mocks.updateMany.mock.calls[0][0].data;
    expect(data.metadata).not.toHaveProperty("publicationError");
    expect(data.metadata.version).toBe(2);
    expect(data.lastError).toBeNull();
  });

  it("keeps the rejection when an unrelated field is edited", async () => {
    const rejected = {
      ...published,
      externalItemId: null,
      metadata: { attributes: [], publicationError: { kind: "review", step: "ficha", field: "BRAND", message: "Falta marca", code: null, at: "2026-09-11T00:00:00.000Z" } },
    };
    mocks.findListing.mockResolvedValue(rejected);
    mocks.findUniqueOrThrow.mockResolvedValue(rejected);
    await patch({ familyName: "Otro nombre" });
    const data = mocks.updateMany.mock.calls[0][0].data;
    expect(data.metadata.publicationError).toMatchObject({ field: "BRAND" });
  });

  it("answers 409 when another tab changed the listing first", async () => {
    mocks.findListing.mockResolvedValue(published);
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const response = await patch({ familyName: "x" });
    expect(response.status).toBe(409);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ metadata: { path: "$.version", equals: 2 } }) }),
    );
  });
});

describe("DELETE /marketplaces/mercadolibre/listings/[listingId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.inProgress.mockResolvedValue(false);
  });

  it("refuses while a publication event is in progress", async () => {
    mocks.findListing.mockResolvedValue({ id: "listing-1", connectionId: "conn", externalItemId: null, status: "DRAFT", _count: { orderItems: 0, questions: 0 } });
    mocks.inProgress.mockResolvedValue(true);
    const response = await DELETE(new Request("https://admin.test/x", { method: "DELETE" }), { params });
    expect(response.status).toBe(409);
    expect(mocks.deleteListing).not.toHaveBeenCalled();
  });

  it("refuses a published listing", async () => {
    mocks.findListing.mockResolvedValue({ id: "listing-1", connectionId: "conn", externalItemId: "MCO1", status: "ACTIVE", _count: { orderItems: 0, questions: 0 } });
    const response = await DELETE(new Request("https://admin.test/x", { method: "DELETE" }), { params });
    expect(response.status).toBe(400);
  });

  it("deletes a clean draft and its outbox events", async () => {
    mocks.findListing.mockResolvedValue({ id: "listing-1", connectionId: "conn", externalItemId: null, status: "DRAFT", _count: { orderItems: 0, questions: 0 } });
    mocks.deleteEvents.mockResolvedValue({ count: 1 });
    mocks.deleteListing.mockResolvedValue({});
    const response = await DELETE(new Request("https://admin.test/x", { method: "DELETE" }), { params });
    expect(response.status).toBe(204);
    expect(mocks.deleteEvents).toHaveBeenCalledWith({ where: { listingId: "listing-1" } });
    expect(mocks.deleteListing).toHaveBeenCalledWith({ where: { id: "listing-1" } });
  });
});
