import {
  MarketplaceConnectionStatus,
  MarketplaceListingStatus,
  MarketplaceOutboxAction,
  MarketplaceOutboxStatus,
  MarketplaceProvider,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: null as string | null }));
const enqueued = vi.hoisted(() => vi.fn().mockResolvedValue(0));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: session.userId }) }));
vi.mock("@/lib/mercadolibre/outbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mercadolibre/outbox")>()),
  enqueuePendingMarketplaceOutboxEventsForStore: enqueued,
}));

import { mutateMercadoLibreJson } from "@/lib/mercadolibre/client";
import { processMarketplaceOutboxEvent } from "@/lib/mercadolibre/outbox";
import { getMercadoLibreHealthSummary } from "@/lib/mercadolibre/health";
import {
  MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE,
  MERCADOLIBRE_WRITES_PAUSED_MESSAGE,
  MercadoLibreWritesPausedError,
  areMercadoLibreWritesPausedForStore,
} from "@/lib/mercadolibre/writes-switch";

import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * Interruptor de emergencia: encendido, nada sale hacia Mercado Libre. La cola
 * no pierde lo pendiente ni gasta intentos, y al reanudar lo suelta de una.
 */
let f: InventoryFixture;
let connectionId = "";
let listingId = "";

const put = (body: unknown) =>
  new Request("https://admin.test/api/x", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  session.userId = f.store.userId;
  connectionId = (
    await testPrisma.marketplaceConnection.create({
      data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: MarketplaceConnectionStatus.CONNECTED, sellerId: `seller-${randomBytes(4).toString("hex")}` },
    })
  ).id;
  listingId = (
    await testPrisma.marketplaceListing.create({
      data: { connectionId, productId: f.component.id, status: MarketplaceListingStatus.ACTIVE, externalItemId: `MCO${randomBytes(4).readUInt32BE()}`, marketplacePrice: 30000, stockSafetyBuffer: 1, syncStock: true },
    })
  ).id;
});

afterAll(async () => {
  await testPrisma.storeSettings.deleteMany({ where: { storeId: f.store.id } });
  await deleteInventoryFixture(f);
  await testPrisma.$disconnect();
});

describe("interruptor de escrituras a Mercado Libre", () => {
  it("la dueña lo enciende y queda anotado cuándo y quién", async () => {
    const { PUT } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/writes-switch/route");
    const response = await PUT(put({ paused: true }), { params: { storeId: f.store.id } });
    expect(response.status).toBe(200);
    const settings = await testPrisma.storeSettings.findUniqueOrThrow({ where: { storeId: f.store.id } });
    expect(settings).toMatchObject({ mercadoLibreWritesPaused: true, mercadoLibreWritesPausedBy: f.store.userId });
    expect(settings.mercadoLibreWritesPausedAt).toBeInstanceOf(Date);
  });

  it("otra persona no puede tocarlo", async () => {
    session.userId = "otra-persona";
    const { PUT } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/writes-switch/route");
    const response = await PUT(put({ paused: false }), { params: { storeId: f.store.id } });
    expect(response.status).toBeGreaterThanOrEqual(401);
    session.userId = f.store.userId;
    await expect(testPrisma.storeSettings.findUniqueOrThrow({ where: { storeId: f.store.id } })).resolves.toMatchObject({ mercadoLibreWritesPaused: true });
  });

  it("en pausa, una escritura directa se niega antes de llamar a Mercado Libre; responder preguntas no", async () => {
    const request = vi.fn();
    await expect(mutateMercadoLibreJson(connectionId, "/items/MCO1", { method: "PUT", body: { price: 1 } }, request)).rejects.toBeInstanceOf(MercadoLibreWritesPausedError);
    expect(request).not.toHaveBeenCalled();
    // Con la excepción de preguntas pasa del interruptor (y sin cuenta real falla después, en el token).
    await expect(mutateMercadoLibreJson(connectionId, "/answers", { method: "POST", body: {}, allowWhileWritesPaused: true }, request)).rejects.not.toBeInstanceOf(
      MercadoLibreWritesPausedError,
    );
  });

  const stockEvent = async (targetQuantity: number) => {
    await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { deduplicationKey: `${connectionId}:stock:${listingId}` } });
    return testPrisma.marketplaceOutboxEvent.create({
      data: {
        connectionId,
        listingId,
        productId: f.component.id,
        action: MarketplaceOutboxAction.SYNC_STOCK,
        deduplicationKey: `${connectionId}:stock:${listingId}`,
        payload: { targetQuantity },
        availableAt: new Date(Date.now() - 1000),
      },
    });
  };

  it("en pausa + subida de stock: la subida espera sin gastar intentos y queda la alerta", async () => {
    // Mercado Libre tiene 2; aquí hay 6 − colchón 1 = 5: es una subida.
    await testPrisma.marketplaceListing.update({ where: { id: listingId }, data: { lastSyncedStock: 2 } });
    await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 6, reservedUnits: 0 } });
    const event = await stockEvent(5);
    await expect(processMarketplaceOutboxEvent(event.id)).resolves.toMatchObject({ processed: false, reason: "writes_paused" });
    const after = await testPrisma.marketplaceOutboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(after).toMatchObject({ status: MarketplaceOutboxStatus.RETRY, attempts: 0, lastError: MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE });
    expect(after.availableAt.getTime()).toBeGreaterThan(Date.now());

    const summary = await getMercadoLibreHealthSummary(connectionId, { includeFinancials: false });
    expect(summary.issues).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "writes_paused_stock", title: "1 subida de stock espera por la pausa" })]));
  });

  it("en pausa + stock a 0: pasa la pausa (sin cuenta real, falla después en el token, no en el interruptor)", async () => {
    await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 0, reservedUnits: 0 } });
    const event = await stockEvent(0);
    const result = await processMarketplaceOutboxEvent(event.id);
    expect(result.reason).not.toBe("writes_paused");
    const after = await testPrisma.marketplaceOutboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(after.lastError).not.toBe(MERCADOLIBRE_WRITES_PAUSED_MESSAGE);
    expect(after.lastError).not.toBe(MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE);
    await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 6, reservedUnits: 1 } });
  });

  it("en pausa + bajada de stock (5 → 3): también pasa", async () => {
    await testPrisma.marketplaceListing.update({ where: { id: listingId }, data: { lastSyncedStock: 5 } });
    await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 4, reservedUnits: 0 } });
    const event = await stockEvent(3);
    await expect(processMarketplaceOutboxEvent(event.id)).resolves.not.toMatchObject({ reason: "writes_paused" });
    await testPrisma.product.update({ where: { id: f.component.id }, data: { stock: 6, reservedUnits: 1 } });
    // Deja el evento como lo dejaría una pausa, para la prueba de reanudar.
    await testPrisma.marketplaceListing.update({ where: { id: listingId }, data: { lastSyncedStock: 2 } });
    await testPrisma.marketplaceOutboxEvent.update({
      where: { id: event.id },
      data: { status: MarketplaceOutboxStatus.RETRY, lastError: MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE, availableAt: new Date(Date.now() + 60_000) },
    });
  });

  it("una tienda sin fila de ajustes cuenta como pausada (el interruptor nace en pausa)", async () => {
    const other = await testPrisma.store.create({ data: { name: "Sin ajustes", userId: `user-${randomBytes(4).toString("hex")}` } });
    try {
      await expect(areMercadoLibreWritesPausedForStore(other.id)).resolves.toBe(true);
    } finally {
      await testPrisma.store.delete({ where: { id: other.id } });
    }
  });

  it("en pausa, «Publicar ahora» responde 409 y no encola nada", async () => {
    const draft = await testPrisma.marketplaceListing.create({
      data: { connectionId, productId: f.kit.id, status: MarketplaceListingStatus.DRAFT, marketplacePrice: 30000 },
    });
    const { POST } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/listings/[listingId]/publish/route");
    const response = await POST(new Request("https://admin.test/api/x", { method: "POST" }), { params: { storeId: f.store.id, listingId: draft.id } });
    expect(response.status).toBe(409);
    await expect(testPrisma.marketplaceOutboxEvent.count({ where: { listingId: draft.id } })).resolves.toBe(0);
  });

  it("al reanudar, lo que esperaba por la pausa queda listo y se encola de inmediato", async () => {
    const { PUT } = await import("@/app/api/[storeId]/marketplaces/mercadolibre/writes-switch/route");
    const response = await PUT(put({ paused: false }), { params: { storeId: f.store.id } });
    await expect(response.json()).resolves.toMatchObject({ paused: false, released: 1 });
    expect(enqueued).toHaveBeenCalledWith(f.store.id);
    const waiting = await testPrisma.marketplaceOutboxEvent.findFirstOrThrow({ where: { listingId, action: MarketplaceOutboxAction.SYNC_STOCK } });
    expect(waiting.lastError).toBeNull();
    expect(waiting.availableAt.getTime()).toBeLessThanOrEqual(Date.now());
    await expect(testPrisma.storeSettings.findUniqueOrThrow({ where: { storeId: f.store.id } })).resolves.toMatchObject({
      mercadoLibreWritesPaused: false,
      mercadoLibreWritesPausedAt: null,
    });
  });
});
