import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findListing: vi.fn(),
  updateMany: vi.fn(),
  getResource: vi.fn(),
  queueStatus: vi.fn(),
  queueContent: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: { findFirst: mocks.findListing, updateMany: mocks.updateMany },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));
vi.mock("@/lib/mercadolibre/client", () => ({ getMercadoLibreResource: mocks.getResource }));
vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreQueueConfigurationStatus: mocks.queueStatus,
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  enqueuePendingMarketplaceOutboxEvents: mocks.enqueue,
  queueMarketplaceListingContentSyncEvent: mocks.queueContent,
}));

import { GET as getQuality } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/quality/route";
import { DELETE as clearReminder, POST as snoozeReminder } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/quality/video-reminder/route";
import { GET as reviewContent } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/content-review/route";
import { POST as syncContent } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/sync-content/route";

const params = { storeId: "store-1", listingId: "listing-1" };
const request = (method = "GET") => new Request("https://admin.test/x", { method });

describe("listing insight routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.queueStatus.mockReturnValue({ configured: true });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("quality needs a published listing and hides an expired snooze", async () => {
    mocks.findListing.mockResolvedValue({ connectionId: "conn", externalItemId: null, metadata: null, product: { videos: [] } });
    expect((await getQuality(request(), { params })).status).toBe(400);

    mocks.findListing.mockResolvedValue({
      connectionId: "conn",
      externalItemId: "MCO1",
      metadata: { quality: { videoRecommendationSnoozedUntil: "2020-01-01T00:00:00.000Z" } },
      product: { videos: [{ id: "v1" }] },
    });
    mocks.getResource.mockResolvedValue({
      score: 80,
      buckets: [
        {
          variables: [
            {
              key: "ITEM_VIDEO",
              title: "Video",
              rules: [
                {
                  key: "ADD_VIDEO",
                  status: "PENDING",
                  mode: "OPPORTUNITY",
                  wordings: { title: "Agrega un video", label: "Subir video" },
                  link: "https://vendedores.mercadolibre.com.co/x",
                },
              ],
            },
          ],
        },
      ],
    });
    const body = await (await getQuality(request(), { params })).json();
    expect(mocks.getResource).toHaveBeenCalledWith("conn", "/item/MCO1/performance");
    expect(body.videoRecommendation).toMatchObject({ preparedVideoCount: 1, snoozedUntil: null });
  });

  it("video reminder writes through the guarded metadata update", async () => {
    mocks.findListing.mockResolvedValue({ id: "listing-1", metadata: { attributes: [], version: 4, source: "MERCADOLIBRE_IMPORT" } });
    const response = await snoozeReminder(request("POST"), { params });
    expect(response.status).toBe(200);
    const call = mocks.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "listing-1", metadata: { path: "$.version", equals: 4 } });
    expect(call.data.metadata).toMatchObject({ source: "MERCADOLIBRE_IMPORT", version: 5, quality: { videoRecommendationSnoozedUntil: expect.any(String) } });

    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await clearReminder(request("DELETE"), { params })).status).toBe(409);
  });

  it("content review is local and answers 404 for a foreign listing", async () => {
    mocks.findListing.mockResolvedValue(null);
    expect((await reviewContent(request(), { params })).status).toBe(404);
    mocks.findListing.mockResolvedValue({
      categoryId: "MCO1",
      marketplacePrice: 1000,
      metadata: { familyName: "Termo", attributes: [{ id: "BRAND", value_name: "Owala" }] },
      product: { name: "Termo", description: "<p>Una descripción larga y clara del termo de acero para llevar agua fría todo el día.</p>", brand: "Owala", gtin: null, mpn: null, images: [{ url: "https://img/a.jpg" }] },
    });
    const body = await (await reviewContent(request(), { params })).json();
    expect(body.checks.length).toBeGreaterThan(0);
    expect(mocks.getResource).not.toHaveBeenCalled();
  });

  it("sync content queues the outbox event once the listing is published and the queue is ready", async () => {
    mocks.findListing.mockResolvedValue({ id: "listing-1", connectionId: "conn", productId: "p", externalItemId: null, connection: { status: "CONNECTED", recoveryScheduleId: "s" } });
    expect((await syncContent(request("POST"), { params })).status).toBe(400);

    mocks.findListing.mockResolvedValue({ id: "listing-1", connectionId: "conn", productId: "p", externalItemId: "MCO1", connection: { status: "CONNECTED", recoveryScheduleId: null } });
    expect((await syncContent(request("POST"), { params })).status).toBe(400);

    mocks.findListing.mockResolvedValue({ id: "listing-1", connectionId: "conn", productId: "p", externalItemId: "MCO1", connection: { status: "CONNECTED", recoveryScheduleId: "s" } });
    const response = await syncContent(request("POST"), { params });
    expect(response.status).toBe(202);
    expect(mocks.queueContent).toHaveBeenCalledWith({}, { connectionId: "conn", listingId: "listing-1", productId: "p" });
    expect(mocks.enqueue).toHaveBeenCalledWith("conn");
  });
});
