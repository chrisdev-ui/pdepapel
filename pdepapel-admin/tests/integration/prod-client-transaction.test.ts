import { MarketplaceConnectionStatus, MarketplaceListingStatus, MarketplaceProvider } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { queueMarketplaceListingPublicationEvent } from "@/lib/mercadolibre/outbox";

import { createProdClient, ProdWriteBlockedError } from "../../scripts/lib/prod-client.mjs";
import { createInventoryFixture, deleteInventoryFixture, testPrisma, type InventoryFixture } from "./helpers/database";

/**
 * El publicador por tandas crea el borrador y encola su evento en una sola
 * transacción con el cliente de prod:write. El 2026-10-31 el guardián cortó
 * la corrida después de crear el borrador y quedó uno huérfano: dentro de la
 * transacción, el mismo corte no debe dejar nada.
 */
let f: InventoryFixture;
let connectionId = "";

beforeAll(async () => {
  await testPrisma.$connect();
  f = await createInventoryFixture();
  connectionId = (
    await testPrisma.marketplaceConnection.create({
      data: { storeId: f.store.id, provider: MarketplaceProvider.MERCADOLIBRE, status: MarketplaceConnectionStatus.CONNECTED, sellerId: `seller-${randomBytes(4).toString("hex")}` },
    })
  ).id;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await testPrisma.marketplaceOutboxEvent.deleteMany({ where: { connectionId } });
  await testPrisma.marketplaceListing.deleteMany({ where: { connectionId } });
  await testPrisma.marketplaceConnection.deleteMany({ where: { id: connectionId } });
  await deleteInventoryFixture(f);
  await testPrisma.$disconnect();
});

const draftAndQueue = (db: typeof testPrisma) =>
  db.$transaction(async (tx) => {
    const listing = await tx.marketplaceListing.create({
      data: { connectionId, productId: f.component.id, status: MarketplaceListingStatus.DRAFT, marketplacePrice: 30000 },
      select: { id: true },
    });
    await queueMarketplaceListingPublicationEvent(tx, { connectionId, listingId: listing.id, productId: f.component.id });
    return listing.id;
  });

describe("cliente de prod:write dentro de una transacción", () => {
  it("con un motivo que no nombra MarketplaceOutboxEvent, el guardián corta y no queda ni el borrador", async () => {
    vi.stubEnv("PROD_WRITE_APPROVED", "1");
    const db = createProdClient({ reason: "Tanda (MarketplaceListing + PUBLISH_LISTING)", client: testPrisma }) as unknown as typeof testPrisma;
    await expect(draftAndQueue(db)).rejects.toBeInstanceOf(ProdWriteBlockedError);
    await expect(testPrisma.marketplaceListing.count({ where: { connectionId } })).resolves.toBe(0);
    await expect(testPrisma.marketplaceOutboxEvent.count({ where: { connectionId } })).resolves.toBe(0);
  });

  it("con el motivo que lo nombra, borrador y evento quedan juntos", async () => {
    vi.stubEnv("PROD_WRITE_APPROVED", "1");
    const db = createProdClient({ reason: "Tanda (MarketplaceListing + MarketplaceOutboxEvent PUBLISH_LISTING)", client: testPrisma }) as unknown as typeof testPrisma;
    const listingId = await draftAndQueue(db);
    await expect(testPrisma.marketplaceOutboxEvent.count({ where: { listingId } })).resolves.toBe(1);
  });
});
