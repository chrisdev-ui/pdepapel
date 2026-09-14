import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { testPrisma } from "./helpers/database";

/**
 * La reclamación del evento tiene que ser atómica contra la base de verdad:
 * Mercado Libre reenvía notificaciones y la cola reintenta, así que el mismo
 * evento puede entrar varias veces a la vez.
 */
vi.mock("@/lib/cache", () => ({ invalidateStoreProductsCache: vi.fn() }));

import { claimQueueRow } from "@/lib/atomic-claim";
import { processMercadoLibreWebhookEvent } from "@/lib/mercadolibre/webhook-processor";

const suffix = randomUUID().slice(0, 8);
let storeId = "";
let connectionId = "";
const eventIds: string[] = [];

const crearEvento = async (topic = "items") => {
  const event = await testPrisma.marketplaceWebhookEvent.create({
    data: {
      connectionId,
      provider: "MERCADOLIBRE",
      eventKey: `evt-${suffix}-${eventIds.length}`,
      // Tema no soportado: se marca procesado sin llamar a Mercado Libre.
      topic,
      resource: "/items/MCO123",
      sellerId: "vendedor-1",
      payload: {},
    },
  });
  eventIds.push(event.id);
  return event.id;
};

beforeAll(async () => {
  const store = await testPrisma.store.create({
    data: { name: `ML ${suffix}`, userId: `owner-${suffix}` },
  });
  storeId = store.id;
  const connection = await testPrisma.marketplaceConnection.create({
    data: { storeId, provider: "MERCADOLIBRE", sellerId: `vendedor-${suffix}` },
  });
  connectionId = connection.id;
});

afterAll(async () => {
  await testPrisma.marketplaceWebhookEvent.deleteMany({
    where: { connectionId },
  });
  await testPrisma.marketplaceConnection.delete({
    where: { id: connectionId },
  });
  await testPrisma.store.delete({ where: { id: storeId } });
});

describe("el mismo aviso de Mercado Libre entrando varias veces", () => {
  it("solo uno lo reclama; el resto no hace nada", async () => {
    const eventId = await crearEvento();

    const resultados = await Promise.all([
      processMercadoLibreWebhookEvent(eventId),
      processMercadoLibreWebhookEvent(eventId),
      processMercadoLibreWebhookEvent(eventId),
      processMercadoLibreWebhookEvent(eventId),
    ]);

    expect(resultados.filter((r) => r.processed)).toHaveLength(1);
    for (const r of resultados.filter((r) => !r.processed)) {
      expect(["claimed_elsewhere", "already_processed"]).toContain(r.reason);
    }

    const event = await testPrisma.marketplaceWebhookEvent.findUnique({
      where: { id: eventId },
      select: { status: true, attempts: true },
    });
    expect(event?.status).toBe("PROCESSED");
    // Un solo intento: los demás ni siquiera incrementaron el contador.
    expect(event?.attempts).toBe(1);
  });

  it("la reclamación en sí es una sola sentencia: cuatro a la vez, una gana", async () => {
    const eventId = await crearEvento();
    const now = new Date();

    const intentos = await Promise.all(
      Array.from({ length: 4 }, () =>
        claimQueueRow({
          table: "MarketplaceWebhookEvent",
          id: eventId,
          from: ["PENDING", "RETRY"],
          dueColumn: "nextRetryAt",
          dueNullMeansReady: true,
          now,
        }),
      ),
    );

    expect(intentos.filter(Boolean)).toHaveLength(1);
    const event = await testPrisma.marketplaceWebhookEvent.findUnique({
      where: { id: eventId },
      select: { attempts: true, status: true },
    });
    expect(event).toMatchObject({ attempts: 1, status: "PROCESSING" });
  });

  it("una reentrega posterior tampoco lo vuelve a procesar", async () => {
    const eventId = await crearEvento();
    await processMercadoLibreWebhookEvent(eventId);

    const segunda = await processMercadoLibreWebhookEvent(eventId);

    expect(segunda).toMatchObject({
      processed: false,
      reason: "already_processed",
    });
    const event = await testPrisma.marketplaceWebhookEvent.findUnique({
      where: { id: eventId },
      select: { attempts: true },
    });
    expect(event?.attempts).toBe(1);
  });
});
