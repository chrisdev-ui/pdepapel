import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findConnection: vi.fn(),
  findListings: vi.fn(),
  queueStatus: vi.fn(),
  queuePublication: vi.fn(),
  queueStock: vi.fn(),
  queuePrice: vi.fn(),
  queueContent: vi.fn(),
  queueListingStatus: vi.fn(),
  enqueue: vi.fn(),
  inProgress: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({
  verifyStoreOwner: mocks.verifyStoreOwner,
  CACHE_HEADERS: { NO_CACHE: {} },
}));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceConnection: { findUnique: mocks.findConnection },
    marketplaceListing: { findMany: mocks.findListings },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback({})),
  },
}));
vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreQueueConfigurationStatus: mocks.queueStatus,
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  enqueuePendingMarketplaceOutboxEvents: mocks.enqueue,
  isMarketplaceListingPublicationInProgress: mocks.inProgress,
  queueMarketplaceListingContentSyncEvent: mocks.queueContent,
  queueMarketplaceListingPublicationEvent: mocks.queuePublication,
  queueMarketplaceListingStatusSyncEvent: mocks.queueListingStatus,
  queueMarketplacePriceSyncEvent: mocks.queuePrice,
  queueMarketplaceStockSyncEvents: mocks.queueStock,
}));

import { POST } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/bulk/route";

const params = { storeId: "store-1" };
const call = (body: unknown) =>
  POST(
    new Request("https://admin.test/api/store-1/marketplaces/mercadolibre/listings/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params },
  );

const base = {
  productId: "p",
  externalItemId: "MCO1",
  marketplacePrice: 1000,
  syncPrice: true,
  syncStock: true,
  status: "ACTIVE",
  metadata: null as unknown,
};

describe("POST /marketplaces/mercadolibre/listings/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.findConnection.mockResolvedValue({ id: "conn", status: "CONNECTED", recoveryScheduleId: "s" });
    mocks.queueStatus.mockReturnValue({ configured: true });
    mocks.inProgress.mockResolvedValue(false);
    mocks.enqueue.mockResolvedValue(3);
  });

  it("caps a batch at 20 listings", async () => {
    const response = await call({ action: "sync_stock", listingIds: Array.from({ length: 21 }, (_, i) => `l${i}`) });
    expect(response.status).toBe(400);
    expect(mocks.findListings).not.toHaveBeenCalled();
  });

  it("publishes only drafts without an open review rejection and reports the rest per listing", async () => {
    mocks.findListings.mockResolvedValue([
      { ...base, id: "draft", externalItemId: null, status: "DRAFT" },
      { ...base, id: "rejected", externalItemId: null, status: "DRAFT", metadata: { publicationError: { kind: "review", step: "ficha", field: "BRAND", message: "x", code: null, at: new Date().toISOString() } } },
      { ...base, id: "closed", externalItemId: null, status: "CLOSED" },
      { ...base, id: "live", status: "ACTIVE" },
      { ...base, id: "sending", externalItemId: null, status: "ERROR" },
    ]);
    mocks.inProgress.mockImplementation(async (_tx: unknown, _c: string, listingId: string) => listingId === "sending");

    const response = await call({ action: "publish", listingIds: ["draft", "rejected", "closed", "live", "sending"] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.queuePublication).toHaveBeenCalledTimes(1);
    expect(mocks.queuePublication).toHaveBeenCalledWith({}, expect.objectContaining({ listingId: "draft" }));
    expect(body.queued).toBe(1);
    expect(Object.fromEntries(body.results.map((r: { listingId: string; outcome: string }) => [r.listingId, r.outcome]))).toEqual({
      draft: "queued",
      rejected: "skipped",
      closed: "skipped",
      live: "skipped",
      sending: "skipped",
    });
    const reasons = Object.fromEntries(body.skipped.map((s: { listingId: string; reason: string }) => [s.listingId, s.reason]));
    expect(reasons.rejected).toMatch(/rechazó un dato/);
    expect(reasons.closed).toMatch(/Solo se publican borradores/);
    expect(reasons.live).toMatch(/Ya está publicada/);
    expect(reasons.sending).toMatch(/Ya se está enviando/);
  });

  it("pauses only active listings and activates only paused ones", async () => {
    mocks.findListings.mockResolvedValue([
      { ...base, id: "active", status: "ACTIVE" },
      { ...base, id: "paused", status: "PAUSED" },
      { ...base, id: "closed", status: "CLOSED" },
    ]);
    const pause = await (await call({ action: "pause", listingIds: ["active", "paused", "closed"] })).json();
    expect(mocks.queueListingStatus).toHaveBeenCalledTimes(1);
    expect(mocks.queueListingStatus).toHaveBeenCalledWith({}, expect.objectContaining({ listingId: "active", targetStatus: "paused" }));
    expect(pause.skipped.map((s: { listingId: string }) => s.listingId).sort()).toEqual(["closed", "paused"]);

    mocks.queueListingStatus.mockClear();
    const activate = await (await call({ action: "activate", listingIds: ["active", "paused", "closed"] })).json();
    expect(mocks.queueListingStatus).toHaveBeenCalledWith({}, expect.objectContaining({ listingId: "paused", targetStatus: "active" }));
    expect(activate.skipped.map((s: { listingId: string }) => s.listingId).sort()).toEqual(["active", "closed"]);
  });

  it("counts stock syncs only for listings that synchronize stock", async () => {
    mocks.findListings.mockResolvedValue([
      { ...base, id: "on", syncStock: true },
      { ...base, id: "off", syncStock: false },
    ]);
    const body = await (await call({ action: "sync_stock", listingIds: ["on", "off"] })).json();
    expect(mocks.queueStock).toHaveBeenCalledWith({}, ["p"]);
    expect(body.queued).toBe(1);
    expect(body.skipped).toEqual([{ listingId: "off", reason: expect.stringMatching(/desactivada/) }]);
  });

  it("refuses ids that do not belong to the connection", async () => {
    mocks.findListings.mockResolvedValue([{ ...base, id: "a" }]);
    const response = await call({ action: "sync_content", listingIds: ["a", "b"] });
    expect(response.status).toBe(400);
    expect(mocks.queueContent).not.toHaveBeenCalled();
  });
});
