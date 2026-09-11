import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findListing: vi.fn(),
  findListingOrThrow: vi.fn(),
  findEvent: vi.fn(),
  findEventOrThrow: vi.fn(),
  queuePublication: vi.fn(),
  process: vi.fn(),
  queueStatus: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner, CACHE_HEADERS: { NO_CACHE: {} } }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceListing: { findFirst: mocks.findListing, findUniqueOrThrow: mocks.findListingOrThrow },
    marketplaceOutboxEvent: { findUnique: mocks.findEvent, findUniqueOrThrow: mocks.findEventOrThrow },
  },
}));
vi.mock("@/lib/mercadolibre/outbox", () => ({
  getMarketplaceListingPublicationKey: (c: string, l: string) => `${c}:publish:${l}`,
  isMarketplaceListingPublicationInProgress: async () =>
    (await mocks.findEvent())?.status === "PROCESSING",
  queueMarketplaceListingPublicationEvent: mocks.queuePublication,
  processMarketplaceOutboxEvent: mocks.process,
}));
vi.mock("@/lib/mercadolibre/queue", () => ({
  getMercadoLibreQueueConfigurationStatus: mocks.queueStatus,
}));

import { POST } from "@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/publish/route";

const params = { storeId: "store-1", listingId: "listing-1" };
const draft = {
  id: "listing-1",
  connectionId: "conn-1",
  productId: "product-1",
  externalItemId: null,
  connection: { status: "CONNECTED", recoveryScheduleId: "sched-1" },
};

describe("POST /marketplaces/mercadolibre/listings/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
    mocks.queueStatus.mockReturnValue({ configured: true });
    mocks.findListing.mockResolvedValue(draft);
    mocks.findEvent.mockResolvedValue(null);
    mocks.findEventOrThrow.mockResolvedValue({ id: "event-1" });
    mocks.queuePublication.mockResolvedValue(undefined);
  });

  it("publishes through the shared outbox event and returns the refreshed listing", async () => {
    mocks.process.mockResolvedValue({ processed: true, reason: "processed" });
    mocks.findListingOrThrow.mockResolvedValue({ ...draft, externalItemId: "MCO-NEW", status: "ACTIVE" });

    const response = await POST(new Request("http://localhost"), { params });

    expect(response.status).toBe(201);
    expect(mocks.queuePublication).toHaveBeenCalledWith(expect.anything(), {
      connectionId: "conn-1",
      listingId: "listing-1",
      productId: "product-1",
    });
    expect(mocks.process).toHaveBeenCalledWith("event-1");
    await expect(response.json()).resolves.toMatchObject({ externalItemId: "MCO-NEW" });
  });

  it("refuses while another process is publishing the same draft", async () => {
    mocks.findEvent.mockResolvedValue({ id: "event-1", status: "PROCESSING" });

    const response = await POST(new Request("http://localhost"), { params });

    expect(response.status).toBe(409);
    expect(mocks.queuePublication).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("answers 409 when the claim was won elsewhere between the check and the run", async () => {
    mocks.process.mockResolvedValue({ processed: false, reason: "claimed_elsewhere" });
    mocks.findListingOrThrow.mockResolvedValue({ ...draft, status: "DRAFT", lastError: null });
    const response = await POST(new Request("http://localhost"), { params });
    expect(response.status).toBe(409);
  });

  it("returns the draft-review message as a 400 and explains scheduled retries", async () => {
    mocks.process.mockResolvedValueOnce({ processed: false, reason: "listing_requires_review" });
    mocks.findListingOrThrow.mockResolvedValueOnce({ ...draft, status: "DRAFT", lastError: "Completa la ficha técnica" });
    let response = await POST(new Request("http://localhost"), { params });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "Completa la ficha técnica" });

    mocks.process.mockResolvedValueOnce({ processed: false, reason: "retry_scheduled" });
    mocks.findListingOrThrow.mockResolvedValueOnce({ ...draft, status: "ERROR", lastError: "Mercado Libre respondió 503" });
    response = await POST(new Request("http://localhost"), { params });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Se reintentará automáticamente"),
    });
  });

  it("refuses a listing that already has a Mercado Libre id", async () => {
    mocks.findListing.mockResolvedValue({ ...draft, externalItemId: "MCO-OLD" });
    const response = await POST(new Request("http://localhost"), { params });
    expect(response.status).toBe(409);
  });
});
