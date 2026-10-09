import {
  MarketplaceListingStatus,
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  markReauth: vi.fn(),
  claimRow: vi.fn(),
  findOutboxEvent: vi.fn(),
  claim: vi.fn(),
  complete: vi.fn(),
  updateOutboxEvent: vi.fn(),
  updateListing: vi.fn(),
  txUpdateListing: vi.fn(),
  txUpdateManyListing: vi.fn(),
  updateConnection: vi.fn(),
  flagConnection: vi.fn(),
  listingFindMany: vi.fn(),
  productFindMany: vi.fn(),
  stockUpsert: vi.fn(),
  createItem: vi.fn(),
  createDescription: vi.fn(),
  enqueue: vi.fn(),
  transaction: vi.fn(),
  findItemFromAttempt: vi.fn(),
  learn: vi.fn(),
}));

vi.mock("@/lib/atomic-claim", () => ({ claimQueueRow: mocks.claimRow }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    marketplaceOutboxEvent: {
      findUnique: mocks.findOutboxEvent,
      updateMany: mocks.claim,
      update: mocks.updateOutboxEvent,
      upsert: mocks.stockUpsert,
    },
    marketplaceListing: {
      update: mocks.updateListing,
      findMany: mocks.listingFindMany,
    },
    product: { findMany: mocks.productFindMany },
    marketplaceConnection: { update: mocks.flagConnection },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/mercadolibre/listings", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mercadolibre/listings")>(
    "@/lib/mercadolibre/listings",
  );
  return {
    ...actual,
    createMercadoLibreItem: mocks.createItem,
    createMercadoLibreItemDescription: mocks.createDescription,
  };
});
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreAccessToken: vi.fn(),
  mutateMercadoLibreJson: vi.fn(),
  markMercadoLibreReauthRequired: mocks.markReauth,
  MercadoLibreReauthError: class extends Error {},
}));
vi.mock("@/lib/mercadolibre/queue", () => ({ enqueueMercadoLibreOutboxEvent: mocks.enqueue }));
vi.mock("@/lib/mercadolibre/category-learning", () => ({ learnFromPublishedListing: mocks.learn }));
vi.mock("@/lib/mercadolibre/publish-attempt", async () => ({
  ...(await vi.importActual<typeof import("@/lib/mercadolibre/publish-attempt")>("@/lib/mercadolibre/publish-attempt")),
  findItemFromAttempt: mocks.findItemFromAttempt,
}));

import { processMarketplaceOutboxEvent } from "@/lib/mercadolibre/outbox";

const tx = {
  marketplaceOutboxEvent: { update: mocks.updateOutboxEvent, updateMany: mocks.complete },
  marketplaceListing: { update: mocks.txUpdateListing, updateMany: mocks.txUpdateManyListing },
  marketplaceConnection: { update: mocks.updateConnection },
  product: { findUnique: vi.fn() },
};

function publishEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "publish-event",
    connectionId: "conn-1",
    action: MarketplaceOutboxAction.PUBLISH_LISTING,
    payload: {},
    status: MarketplaceOutboxStatus.PENDING,
    attempts: 0,
    availableAt: new Date(Date.now() - 1000),
    listing: {
      id: "listing-1",
      connectionId: "conn-1",
      externalItemId: null,
      externalVariationId: null,
      categoryId: "MCO1234",
      listingType: "gold_special",
      marketplacePrice: 15000,
      stockSafetyBuffer: 1,
      metadata: null,
      product: {
        id: "product-1",
        name: "Agenda",
        description: "<p>Agenda kawaii</p>",
        stock: 5,
        sku: "AGE-1",
        brand: null,
        gtin: null,
        mpn: null,
        isArchived: false,
        images: [{ url: "https://img/1.jpg", isMain: true }],
      },
    },
    ...overrides,
  };
}

describe("PUBLISH_LISTING outbox event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.claimRow.mockResolvedValue(true);
    mocks.complete.mockResolvedValue({ count: 1 });
    mocks.updateOutboxEvent.mockResolvedValue({});
    mocks.updateListing.mockResolvedValue({});
    mocks.txUpdateListing.mockResolvedValue({});
    mocks.txUpdateManyListing.mockResolvedValue({ count: 1 });
    mocks.updateConnection.mockResolvedValue({});
    mocks.flagConnection.mockResolvedValue({});
    mocks.productFindMany.mockResolvedValue([{ id: "product-1", stock: 5 }]);
    mocks.listingFindMany.mockResolvedValue([
      { id: "listing-1", connectionId: "conn-1", productId: "product-1", stockSafetyBuffer: 1 },
    ]);
    mocks.stockUpsert.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
    mocks.createItem.mockResolvedValue({ id: "MCO-NEW", permalink: "https://ml/x", status: "active" });
    mocks.createDescription.mockResolvedValue(null);
  });

  it("persists the remote id before the description and queues a stock sync, then completes", async () => {
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toEqual({
      processed: true,
      reason: "processed",
    });

    expect(mocks.updateListing).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "listing-1" },
        data: expect.objectContaining({
          externalItemId: "MCO-NEW",
          status: MarketplaceListingStatus.ACTIVE,
          lastSyncedStock: 4,
          lastSyncedPrice: 15000,
        }),
      }),
    );
    expect(mocks.updateListing.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.createDescription.mock.invocationCallOrder[0],
    );
    expect(mocks.stockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deduplicationKey: "conn-1:stock:listing-1" } }),
    );
    expect(mocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceOutboxStatus.COMPLETED }) }),
    );
  });

  it("guarda el producto de usuario y la familia del ítem creado", async () => {
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    mocks.createItem.mockResolvedValue({ id: "MCO-NEW", permalink: "https://ml/x", status: "active", userProductId: "MCOU9", familyId: "777" });

    await processMarketplaceOutboxEvent("publish-event");

    const saved = mocks.updateListing.mock.calls.find(([arg]) => arg.data.externalItemId === "MCO-NEW")![0].data;
    expect(saved.externalUserProductId).toBe("MCOU9");
    expect(saved.metadata.mercadoLibreFamilyId).toBe("777");
  });

  it("aprende la categoría de la subcategoría al publicar, y no al conciliar una ya publicada", async () => {
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    await processMarketplaceOutboxEvent("publish-event");
    expect(mocks.learn).toHaveBeenCalledWith("listing-1");

    mocks.learn.mockClear();
    mocks.findOutboxEvent.mockResolvedValue(publishEvent({ listing: { ...publishEvent().listing, externalItemId: "MCO-OLD" } }));
    await processMarketplaceOutboxEvent("publish-event");
    expect(mocks.learn).not.toHaveBeenCalled();
  });

  it("keeps the listing published and only records a warning when the description fails", async () => {
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    mocks.createDescription.mockResolvedValue("La descripción no se pudo enviar a Mercado Libre: timeout. Edítala en Mercado Libre.");

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toMatchObject({ processed: true });

    const txUpdate = mocks.txUpdateListing.mock.calls[0][0];
    expect(txUpdate.data.externalItemId).toBe("MCO-NEW");
    expect(txUpdate.data.status).toBe(MarketplaceListingStatus.ACTIVE);
    expect(txUpdate.data.lastError).toContain("descripción no se pudo enviar");
    expect(mocks.updateOutboxEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceOutboxStatus.RETRY }) }),
    );
  });

  it("never downgrades a listing whose item was already created when a later write fails", async () => {
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    mocks.transaction.mockRejectedValueOnce(new Error("DB blip"));

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toEqual({
      processed: false,
      reason: "retry_scheduled",
    });

    // La marca de intento y después el id: el estado no se toca y el reintento concilia.
    expect(mocks.updateListing).toHaveBeenCalledTimes(2);
    expect(mocks.updateListing.mock.calls.at(-1)![0].data.externalItemId).toBe("MCO-NEW");
    expect(mocks.updateListing).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceListingStatus.ERROR }) }),
    );
  });

  it("treats an already published listing as a no-op that completes and reconciles DRAFT/ERROR to ACTIVE", async () => {
    mocks.findOutboxEvent.mockResolvedValue(
      publishEvent({ listing: { ...publishEvent().listing, externalItemId: "MCO-OLD" } }),
    );

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toEqual({
      processed: true,
      reason: "processed",
    });

    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.txUpdateManyListing).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "listing-1",
          status: { in: [MarketplaceListingStatus.DRAFT, MarketplaceListingStatus.ERROR] },
        }),
        data: { status: MarketplaceListingStatus.ACTIVE, lastError: null },
      }),
    );
    expect(mocks.updateListing).not.toHaveBeenCalled();
  });

  it("marks a rejected draft for review and never retries it", async () => {
    const { MercadoLibrePublicationError } = await import("@/lib/mercadolibre/listings");
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    mocks.createItem.mockRejectedValueOnce(
      new MercadoLibrePublicationError("Completa los campos obligatorios", { requiresDraftReview: true }),
    );

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toEqual({
      processed: false,
      reason: "listing_requires_review",
    });
    expect(mocks.updateListing).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceListingStatus.DRAFT }) }),
    );
    expect(mocks.updateOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceOutboxStatus.FAILED }) }),
    );
  });

  it("keeps the listing status on a transient Mercado Libre failure and schedules a retry", async () => {
    const { MercadoLibrePublicationError } = await import("@/lib/mercadolibre/listings");
    mocks.findOutboxEvent.mockResolvedValue(publishEvent({ attempts: 2 }));
    mocks.createItem.mockRejectedValueOnce(
      new MercadoLibrePublicationError("Mercado Libre no respondió correctamente (503). Se reintentará automáticamente.", { kind: "transient" }),
    );

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toEqual({
      processed: false,
      reason: "retry_scheduled",
    });
    const update = mocks.updateListing.mock.calls.at(-1)![0];
    expect(update.data.status).toBeUndefined();
    expect(update.data.lastError).toContain("503");
    expect(update.data.metadata.publicationError).toMatchObject({ kind: "transient", step: null });
    expect(mocks.updateOutboxEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: MarketplaceOutboxStatus.RETRY }) }),
    );
    expect(mocks.flagConnection).not.toHaveBeenCalled();
  });

  it("guarda la marca de intento ANTES de crear el ítem en Mercado Libre", async () => {
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    const order: string[] = [];
    mocks.updateListing.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      if ((data.metadata as Record<string, unknown> | undefined)?.publishAttempt) order.push("marca");
      return {};
    });
    mocks.createItem.mockImplementation(async () => {
      order.push("crear");
      return { id: "MCO-1", permalink: "https://ml/1", status: "active" };
    });
    await processMarketplaceOutboxEvent("publish-event");
    expect(order.slice(0, 2)).toEqual(["marca", "crear"]);
    const saved = mocks.updateListing.mock.calls.find(([arg]) => arg.data.externalItemId === "MCO-1")![0].data;
    expect(saved.metadata.publishAttempt).toBeUndefined();
  });

  it("si un intento anterior se cortó después de que Mercado Libre creó el ítem, lo adopta y no crea un segundo", async () => {
    mocks.findOutboxEvent.mockResolvedValue(
      publishEvent({
        listing: { ...publishEvent().listing, metadata: { publishAttempt: { startedAt: "2026-10-09T15:00:00.000Z", sku: "AGE-1" } } },
      }),
    );
    mocks.findItemFromAttempt.mockResolvedValue({ id: "MCO-YA-CREADO", permalink: "https://ml/ya", status: "active" });

    await processMarketplaceOutboxEvent("publish-event");

    expect(mocks.findItemFromAttempt).toHaveBeenCalledWith("conn-1", { startedAt: "2026-10-09T15:00:00.000Z", sku: "AGE-1" });
    expect(mocks.createItem).not.toHaveBeenCalled();
    expect(mocks.updateListing).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ externalItemId: "MCO-YA-CREADO" }) }));
  });

  it("si el intento anterior no alcanzó a crear nada en Mercado Libre, crea el ítem normalmente", async () => {
    mocks.findOutboxEvent.mockResolvedValue(
      publishEvent({ listing: { ...publishEvent().listing, metadata: { publishAttempt: { startedAt: "2026-10-09T15:00:00.000Z", sku: "AGE-1" } } } }),
    );
    mocks.findItemFromAttempt.mockResolvedValue(null);
    mocks.createItem.mockResolvedValue({ id: "MCO-2", permalink: "https://ml/2", status: "active" });
    await processMarketplaceOutboxEvent("publish-event");
    expect(mocks.createItem).toHaveBeenCalledTimes(1);
  });

  it("flags the connection for reauthentication instead of blaming the draft", async () => {
    const { MercadoLibrePublicationError } = await import("@/lib/mercadolibre/listings");
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    mocks.createItem.mockRejectedValueOnce(
      new MercadoLibrePublicationError("Mercado Libre no autorizó la publicación. Reconecta la cuenta.", { kind: "reauth" }),
    );

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toMatchObject({ reason: "retry_scheduled" });
    expect(mocks.updateListing.mock.calls.at(-1)![0].data.status).toBeUndefined();
    expect(mocks.markReauth).toHaveBeenCalledWith(expect.any(String));
    // Sin cuenta conectada no se reintenta cada pocos minutos ni se gastan los doce intentos.
    const parked = mocks.updateOutboxEvent.mock.calls.at(-1)![0].data;
    expect(parked.status).toBe(MarketplaceOutboxStatus.RETRY);
    expect(parked.availableAt.getTime() - Date.now()).toBeGreaterThan(5 * 60 * 60 * 1000);
  });

  it("records step and field of a rejection so the wizard can reopen on the right place", async () => {
    const { MercadoLibrePublicationError } = await import("@/lib/mercadolibre/listings");
    mocks.findOutboxEvent.mockResolvedValue(publishEvent());
    mocks.createItem.mockRejectedValueOnce(
      new MercadoLibrePublicationError("Mercado Libre exige el campo «BRAND»", {
        kind: "review",
        step: "ficha",
        field: "BRAND",
        code: "item.attributes.missing_required",
      }),
    );

    await expect(processMarketplaceOutboxEvent("publish-event")).resolves.toMatchObject({ reason: "listing_requires_review" });
    const update = mocks.updateListing.mock.calls.at(-1)![0];
    expect(update.data.status).toBe(MarketplaceListingStatus.DRAFT);
    expect(update.data.metadata.publicationError).toMatchObject({ kind: "review", step: "ficha", field: "BRAND" });
  });

  it("maps every post-create status the same way as the route", async () => {
    const { getMarketplaceListingStatusFromRemote } = await import("@/lib/mercadolibre/listings");
    expect(getMarketplaceListingStatusFromRemote("active")).toEqual({ status: "ACTIVE", note: null });
    expect(getMarketplaceListingStatusFromRemote("paused").status).toBe("PAUSED");
    expect(getMarketplaceListingStatusFromRemote("closed").status).toBe("CLOSED");
    expect(getMarketplaceListingStatusFromRemote("under_review")).toMatchObject({
      status: "PAUSED",
      note: expect.stringContaining("revisando"),
    });
    expect(getMarketplaceListingStatusFromRemote("payment_required")).toMatchObject({
      status: "PAUSED",
      note: expect.stringContaining("pago"),
    });
    expect(getMarketplaceListingStatusFromRemote(null).status).toBe("PAUSED");
  });
});
